import { collectCursorEntries } from "./cursor";
import {
	type CollectedUsage,
	collectUsageEntries,
	createUsageScanCaches,
	type UsageScanCaches,
} from "./entries";
import { rememberLabel, type UsageLogEntry } from "./parse";
import { MemoryStateStore, type UsageStateStore } from "./usage-store";

/** The widest window a caller asks for (90 days), plus a day for the gap
 * between local and UTC midnight. */
const INDEX_HORIZON_DAYS = 92;
/** A snapshot this recent is served without a new scan. */
const FRESH_MS = 15_000;
/** Well inside the usage task timeout: a timed-out task retires the worker
 * that holds the warm index. */
const WAIT_MS = 60_000;
const CURSOR_WAIT_MS = 20_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Kept as a string: the name crosses the worker boundary, and a minifier
 * may rename the class. */
export const USAGE_INDEXING_ERROR = "UsageIndexingError";

export class UsageIndexingError extends Error {
	constructor() {
		super("Usage history is still being read. Try again in a minute.");
		this.name = USAGE_INDEXING_ERROR;
	}
}

/** Usage entries from `cutoffMs` on, as a request needs them. */
export type CollectUsage = (
	cutoffMs: number,
	options: { cwdCandidates?: readonly string[] },
) => Promise<CollectedUsage>;

/** One scan of every agent's local logs, reusing the parse caches. */
export type ScanUsage = (
	cutoffMs: number,
	caches: UsageScanCaches,
) => Promise<CollectedUsage>;

interface Snapshot extends CollectedUsage {
	cutoffMs: number;
	finishedAt: number;
}

/** Usage entries for the last INDEX_HORIZON_DAYS. A refresh runs in the
 * background and outlives the request that started it. */
export class UsageIndex {
	private readonly caches: UsageScanCaches;
	private snapshot: Snapshot | null = null;
	private refreshing: Promise<void> | null = null;

	constructor(
		private readonly scan: ScanUsage,
		private readonly now: () => number,
		store: UsageStateStore = new MemoryStateStore(),
	) {
		this.caches = createUsageScanCaches(store);
	}

	/** Waits up to `waitMs` for a running refresh, then serves the last
	 * snapshot; throws UsageIndexingError if none covers `cutoffMs` yet. */
	async read(cutoffMs: number, waitMs: number): Promise<CollectedUsage> {
		if (!this.snapshot || this.now() - this.snapshot.finishedAt > FRESH_MS) {
			this.startRefresh();
		}
		const refreshing = this.refreshing;
		if (refreshing) await waitAtMost(refreshing, waitMs);
		const snapshot = this.snapshot;
		if (!snapshot || cutoffMs < snapshot.cutoffMs) {
			throw new UsageIndexingError();
		}
		return {
			entries: snapshot.entries.filter(
				(entry) => entry.timestampMs >= cutoffMs,
			),
			sessionLabels: new Map(snapshot.sessionLabels),
			scannedFiles: snapshot.scannedFiles,
		};
	}

	private startRefresh(): void {
		if (this.refreshing) return;
		const cutoffMs = utcDayStart(this.now() - INDEX_HORIZON_DAYS * DAY_MS);
		this.refreshing = (async () => {
			this.caches.store.beginScan();
			const collected = await this.scan(cutoffMs, this.caches);
			this.caches.store.endScan();
			this.snapshot = { ...collected, cutoffMs, finishedAt: this.now() };
		})()
			.catch((error) => {
				console.warn("[usage-index] refresh failed", error);
			})
			.finally(() => {
				this.refreshing = null;
			});
	}
}

function utcDayStart(ms: number): number {
	const day = new Date(ms);
	return Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate());
}

/** Resolves true if `promise` settles within `ms`, false otherwise. */
async function waitAtMost(
	promise: Promise<unknown>,
	ms: number,
): Promise<boolean> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([
			promise.then(() => true),
			new Promise<boolean>((resolve) => {
				timer = setTimeout(() => resolve(false), ms);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
}

let workerIndex: UsageIndex | null = null;

/** Serves a request from this worker's index. Cursor is fetched per request:
 * it attributes entries with the caller's workspace paths. */
export const collectFromIndex: CollectUsage = async (cutoffMs, options) => {
	workerIndex ??= new UsageIndex(
		(scanCutoffMs, caches) =>
			collectUsageEntries(INDEX_HORIZON_DAYS, scanCutoffMs, { caches }),
		Date.now,
		new MemoryStateStore(),
	);
	const collected = await workerIndex.read(cutoffMs, WAIT_MS);
	const cursor = cursorUsage(cutoffMs, options.cwdCandidates ?? []);
	// A hung keychain lookup must not time out the task: that would retire
	// the worker that holds the warm index. The collection keeps running and
	// a later request picks it up.
	if (!(await waitAtMost(cursor.done, CURSOR_WAIT_MS))) {
		console.warn("[usage-index] Cursor usage is slow; returning without it");
		return collected;
	}
	for (const entry of cursor.entries) collected.entries.push(entry);
	for (const [id, label] of cursor.labels) {
		rememberLabel(collected.sessionLabels, id, label);
	}
	return collected;
};

interface CursorUsage {
	entries: UsageLogEntry[];
	labels: Map<string, string>;
	done: Promise<void>;
	finishedAt?: number;
}

/** Same as the Cursor events cache, so reuse never serves older data. */
const CURSOR_REUSE_MS = 5 * 60 * 1000;
/** One collection per window and workspace set, reused while it runs and
 * for a while after, so a lookup slower than CURSOR_WAIT_MS still lands. */
const cursorRuns = new Map<string, CursorUsage>();

function cursorUsage(
	cutoffMs: number,
	cwdCandidates: readonly string[],
): CursorUsage {
	const now = Date.now();
	for (const [runKey, run] of cursorRuns) {
		if (
			run.finishedAt !== undefined &&
			now - run.finishedAt >= CURSOR_REUSE_MS
		) {
			cursorRuns.delete(runKey);
		}
	}
	const key = `${cutoffMs}\u0000${[...cwdCandidates].sort().join("\u0000")}`;
	const existing = cursorRuns.get(key);
	if (existing) return existing;
	const usage: CursorUsage = {
		entries: [],
		labels: new Map(),
		done: Promise.resolve(),
	};
	usage.done = collectCursorEntries(
		cutoffMs,
		usage.entries,
		usage.labels,
		cwdCandidates,
	).then(
		() => {
			usage.finishedAt = Date.now();
		},
		(error) => {
			// Only a success is reused; the next request tries again.
			cursorRuns.delete(key);
			console.warn("[usage-index] Cursor usage unavailable", error);
		},
	);
	cursorRuns.set(key, usage);
	return usage;
}
