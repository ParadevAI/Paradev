import { join } from "node:path";
import { resolveAppHomeDir } from "@superset/agent-setup/paths";
import { HOST_SERVICE_VERSION } from "../../../../install-source";
import { collectCursorEntries } from "./cursor";
import {
	type CollectedUsage,
	collectUsageEntries,
	createUsageScanCaches,
	type UsageScanCaches,
} from "./entries";
import type { UsageLogEntry } from "./parse";
import {
	MemoryStateStore,
	SqliteStateStore,
	type UsageStateStore,
} from "./usage-store";

/** The widest window a caller asks for (90 days), plus a day for the gap
 * between local and UTC midnight. */
const INDEX_HORIZON_DAYS = 92;
/** A snapshot this recent is served without a new scan. */
const FRESH_MS = 15_000;
/** Well inside the usage task timeout: a timed-out task retires the worker
 * that holds the warm index. */
const WAIT_MS = 60_000;
/** Bump when a parser's saved state changes; each release also starts a new
 * cache through HOST_SERVICE_VERSION. */
const USAGE_CACHE_FORMAT = 1;
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

async function waitAtMost(promise: Promise<void>, ms: number): Promise<void> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	await Promise.race([
		promise,
		new Promise<void>((resolve) => {
			timer = setTimeout(resolve, ms);
		}),
	]);
	clearTimeout(timer);
}

function openStore(): UsageStateStore {
	try {
		return SqliteStateStore.open(
			join(resolveAppHomeDir(), "usage", "usage-cache.db"),
			`${USAGE_CACHE_FORMAT}:${HOST_SERVICE_VERSION}`,
		);
	} catch (error) {
		console.warn("[usage-index] cache store unavailable; using memory", error);
		return new MemoryStateStore();
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
		openStore(),
	);
	const collected = await workerIndex.read(cutoffMs, WAIT_MS);
	const cursorEntries: UsageLogEntry[] = [];
	try {
		await collectCursorEntries(
			cutoffMs,
			cursorEntries,
			collected.sessionLabels,
			options.cwdCandidates ?? [],
		);
	} catch {
		// A signed-out CLI or an offline host contributes nothing.
	}
	for (const entry of cursorEntries) collected.entries.push(entry);
	return collected;
};
