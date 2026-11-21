import type {
	ChatTurn,
	OutboxEntry,
	SessionSnapshot,
	StoredItem,
} from "../../core";
import {
	createTurnDeriver,
	emptySnapshot,
	hasOmittedBody,
	Outbox,
	reduceMany,
	runningTurnId,
	snapshotFromOutline,
	withItemBodies,
	withStoredHistory,
} from "../../core";
import type { UsageLimitAction } from "../../protocol/commands";
import type { Cursor } from "../../protocol/cursor";
import type {
	DeltaChannel,
	Envelope,
	SessionState,
} from "../../protocol/envelope";
import { isDurableEnvelope, isResetEnvelope } from "../../protocol/envelope";
import type {
	Decision,
	ToolCall,
	UserContent,
	UserMessage,
} from "../../protocol/items";
import type { SessionClient } from "../sessionClient";
import type { SessionStream, Wait } from "../subscribeToSession";
import {
	DEFAULT_BACKOFF_INITIAL_MS,
	DEFAULT_BACKOFF_MAX_MS,
} from "../subscribeToSession";
import { newerThan } from "./utils/newerThan";
import {
	cachedSnapshot,
	cacheSnapshot,
	forgetSnapshot,
	primeSnapshot,
	takePrimedSnapshot,
} from "./utils/snapshotCache";

export type FrameScheduler = (flush: () => void) => () => void;

export type ChatStatus = "loading" | "ready" | "running";

/** Earlier pages of the conversation that are not loaded yet. */
export type OlderStatus = "none" | "more" | "loading" | "failed";

export type ChatQueue = {
	/** Prompts waiting behind the running turn. */
	prompts: readonly UserMessage[];
	paused: boolean;
};

export type ChatState = {
	status: ChatStatus;
	session: SessionState | null;
	turns: readonly ChatTurn[];
	queue: ChatQueue;
	older: OlderStatus;
};

export type LoadHistory = (
	sessionId: string,
) => Promise<SessionSnapshot | null>;

export type ChatSessionOptions = {
	client: SessionClient;
	/** A stored copy of the conversation to show before, and in front of, the host's own. */
	loadHistory?: LoadHistory;
	deltas?: readonly DeltaChannel[];
	pageSize?: number;
	scheduler?: FrameScheduler;
	wait?: Wait;
};

export const DEFAULT_DELTAS: readonly DeltaChannel[] = [
	"text",
	"tool_input",
	"terminal",
	"background",
];

const SEED_TIMEOUT_MS = 10_000;
const MAX_BODIES_PER_REQUEST = 100;
const MAX_BODY_ATTEMPTS = 3;
const NO_PROMPTS: readonly UserMessage[] = [];

type Seed =
	| { kind: "outline"; snapshot: SessionSnapshot }
	| { kind: "page"; envelopes: Envelope[]; nextBefore: Cursor | null };

const defaultScheduler: FrameScheduler = (flush) => {
	const scope = globalThis as {
		requestAnimationFrame?: (callback: () => void) => number;
		cancelAnimationFrame?: (handle: number) => void;
	};
	if (typeof scope.requestAnimationFrame === "function") {
		const frame = scope.requestAnimationFrame(() => flush());
		return () => scope.cancelAnimationFrame?.(frame);
	}
	const timer = setTimeout(flush, 16);
	return () => clearTimeout(timer);
};

const defaultWait: Wait = (callback, delayMs) => {
	const timer = setTimeout(callback, delayMs);
	return () => clearTimeout(timer);
};

async function fetchSeed(
	client: SessionClient,
	pageSize: number | undefined,
	timed: <T>(request: Promise<T>) => Promise<T> = (request) => request,
): Promise<Seed | null> {
	try {
		const outline = await timed(client.getOutline());
		if (outline.ok) {
			return {
				kind: "outline",
				snapshot: snapshotFromOutline(outline.outline),
			};
		}
	} catch {}
	const page = await timed(client.getItems({ limit: pageSize }));
	if (!page.ok) return null;
	return {
		kind: "page",
		envelopes: page.envelopes,
		nextBefore: page.nextBefore,
	};
}

/** Loads a chat ahead of its first open, so that open shows it at once. */
export async function prefetchChat(
	client: SessionClient,
	pageSize?: number,
): Promise<boolean> {
	const seed = await fetchSeed(client, pageSize).catch(() => null);
	if (!seed) return false;
	if (seed.kind === "outline") {
		primeSnapshot(client.sessionId, seed.snapshot);
	} else {
		cacheSnapshot(
			client.sessionId,
			reduceMany(emptySnapshot(), seed.envelopes),
		);
	}
	return true;
}

function withCachedBodies(seed: Seed, cached: SessionSnapshot): Seed {
	if (seed.kind !== "outline") return seed;
	const bodies = [...cached.items.values()].filter(({ item }) => {
		if (item.kind !== "tool_call" || hasOmittedBody(item)) return false;
		const fresh = seed.snapshot.items.get(item.id)?.item;
		return (
			fresh?.kind === "tool_call" &&
			(fresh as ToolCall).status !== "running" &&
			(fresh as ToolCall).status === (item as ToolCall).status
		);
	});
	if (bodies.length === 0) return seed;
	return { kind: "outline", snapshot: withItemBodies(seed.snapshot, bodies) };
}

function sameList<T>(previous: readonly T[], next: readonly T[]): boolean {
	return (
		previous.length === next.length &&
		previous.every((value, index) => value === next[index])
	);
}

/**
 * One chat: its state, kept outside any view, and the actions on it. A view
 * reads `getState()` and listens with `subscribe`; the state object changes
 * only when something in it did.
 */
export class ChatSession {
	readonly sessionId: string;
	readonly client: SessionClient;

	private readonly loadHistory: LoadHistory | undefined;
	private readonly deltas: readonly DeltaChannel[];
	private readonly pageSize: number | undefined;
	private readonly scheduler: FrameScheduler;
	private readonly wait: Wait;
	private readonly outbox: Outbox;
	private readonly deriveTurns = createTurnDeriver();
	private readonly listeners = new Set<() => void>();

	private live: SessionSnapshot;
	private stored: SessionSnapshot | null = null;
	private merged: {
		stored: SessionSnapshot;
		live: SessionSnapshot;
		result: SessionSnapshot;
	} | null = null;
	private loaded = false;
	private connected = false;
	private sendEnabled = true;
	private snapshotWorktree = false;
	private nextBefore: Cursor | null = null;
	private loadingOlder = false;
	private olderFailed = false;
	private queued: readonly UserMessage[] = NO_PROMPTS;
	private state: ChatState;

	private generation = 0;
	private stream: SessionStream | null = null;
	private pending: Envelope[] = [];
	private cancelFlush: (() => void) | null = null;
	private cancelRetry: (() => void) | null = null;
	private resyncing = false;
	private resyncAgain = false;
	private resyncBuffer: Envelope[] | null = null;
	private requestedBodies = new Set<string>();
	private bodyQueue: string[] = [];
	private bodyFlushQueued = false;
	private bodyAttempts = new Map<string, number>();
	private seedGeneration = 0;

	constructor(options: ChatSessionOptions) {
		this.client = options.client;
		this.sessionId = options.client.sessionId;
		this.loadHistory = options.loadHistory;
		this.deltas = options.deltas ?? DEFAULT_DELTAS;
		this.pageSize = options.pageSize;
		this.scheduler = options.scheduler ?? defaultScheduler;
		this.wait = options.wait ?? defaultWait;
		this.live = cachedSnapshot(this.sessionId) ?? emptySnapshot();
		this.outbox = new Outbox({
			canSend: () => this.sendEnabled && this.connected,
			send: async (entry) => {
				await this.client.prompt({
					commandId: entry.commandId,
					clientId: entry.clientId,
					content: entry.content,
					...(entry.steer ? { steer: entry.steer } : {}),
					...(this.snapshotWorktree ? { snapshotWorktree: true } : {}),
				});
			},
		});
		this.outbox.subscribe(() => this.publish());
		this.state = this.computeState();
	}

	getState = (): ChatState => this.state;

	subscribe = (listener: () => void): (() => void) => {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	};

	/** The conversation as the log holds it, for readers that are not views. */
	log(): SessionSnapshot {
		return this.shown();
	}

	/** Loads the chat and follows its stream until `stop`. */
	start(): void {
		this.stop();
		const generation = ++this.generation;
		const current = () => this.generation === generation;
		const primed = takePrimedSnapshot(this.sessionId);
		const cached = cachedSnapshot(this.sessionId);
		this.live = cached ?? emptySnapshot();
		this.loaded = false;
		this.connected = false;
		this.nextBefore = null;
		this.loadingOlder = false;
		this.olderFailed = false;
		this.pending = [];
		this.publish();

		if (this.loadHistory) {
			void this.loadHistory(this.sessionId)
				.catch(() => null)
				.then((stored) => {
					if (!current() || !stored) return;
					this.stored = stored;
					this.publish();
				});
		}

		const timed = <T>(request: Promise<T>) =>
			new Promise<T>((resolve, reject) => {
				const cancelTimeout = this.wait(
					() => reject(new Error("timed out")),
					SEED_TIMEOUT_MS,
				);
				request.then(
					(value) => {
						cancelTimeout();
						resolve(value);
					},
					(error: unknown) => {
						cancelTimeout();
						reject(error);
					},
				);
			});

		const subscribe = (since: Cursor | null) => {
			this.stream = this.client.subscribe({
				deltas: this.deltas,
				since,
				onEnvelope: (envelope) => {
					if (current() && !isResetEnvelope(envelope)) this.enqueue(envelope);
				},
				onReset: () => {
					if (current()) void this.resync(true);
				},
				onStatusChange: (next) => {
					if (!current()) return;
					this.connected = next === "open";
					if (this.connected) void this.outbox.flush();
				},
			});
		};

		const seed = async (attempt: number) => {
			let session: Awaited<ReturnType<SessionClient["getSession"]>>;
			let fetched: Seed | null;
			try {
				[session, fetched] = await Promise.all([
					timed(this.client.getSession()),
					fetchSeed(this.client, this.pageSize, timed),
				]);
			} catch {
				if (!current()) return;
				const delayMs = Math.min(
					DEFAULT_BACKOFF_INITIAL_MS * 2 ** attempt,
					DEFAULT_BACKOFF_MAX_MS,
				);
				this.cancelRetry = this.wait(() => {
					this.cancelRetry = null;
					void seed(attempt + 1);
				}, delayMs);
				return;
			}
			if (!current()) return;
			let seeded: SessionSnapshot | null = null;
			if (fetched) {
				seeded = this.applySeed(
					cached ? withCachedBodies(fetched, cached) : fetched,
					false,
				);
			} else {
				if (!session.session) forgetSnapshot(this.sessionId);
				this.live = emptySnapshot();
			}
			this.loaded = true;
			this.publish();
			subscribe(seeded?.cursor ?? session.cursor);
		};

		if (primed) {
			const seeded = this.applySeed(
				{ kind: "outline", snapshot: primed },
				false,
			);
			this.loaded = true;
			this.publish();
			subscribe(seeded?.cursor ?? null);
		} else {
			void seed(0);
		}
	}

	/** Stops following the chat and keeps what it loaded for the next `start`. */
	stop(): void {
		if (this.loaded && !this.live.pendingReset) {
			cacheSnapshot(this.sessionId, this.live);
		}
		this.generation += 1;
		this.seedGeneration += 1;
		this.connected = false;
		this.cancelRetry?.();
		this.cancelRetry = null;
		this.cancelFlush?.();
		this.cancelFlush = null;
		this.pending = [];
		this.stream?.close();
		this.stream = null;
	}

	/** Prompts wait in the outbox while sending is off. */
	setSendEnabled(enabled: boolean): void {
		if (this.sendEnabled === enabled) return;
		this.sendEnabled = enabled;
		if (enabled) void this.outbox.flush();
	}

	setSnapshotWorktree(enabled: boolean): void {
		this.snapshotWorktree = enabled;
	}

	send = (
		content: UserContent[],
		steer?: { expectedTurnId: string },
	): OutboxEntry => {
		const entry = this.outbox.enqueue(content, steer);
		void this.outbox.flush();
		return entry;
	};

	retry = (clientId: string): void => {
		this.outbox.retry(clientId);
		void this.outbox.flush();
	};

	discard = (clientId: string): void => {
		this.outbox.discard(clientId);
	};

	/** Stops the running turn, if there is one. */
	cancel = async (options?: { pauseQueue?: boolean }): Promise<void> => {
		const turnId = runningTurnId(this.live.turns);
		if (turnId) await this.client.cancelTurn(turnId, options);
	};

	respond = (approvalId: string, decision: Decision): Promise<void> =>
		this.client.respondToApproval(approvalId, decision);

	stopTask = (taskId: string): Promise<boolean> =>
		this.client.stopBackgroundTask(taskId);

	setMode = (modeId: string): Promise<void> => this.client.setMode(modeId);

	setConfig = (
		configId: string,
		value: string,
		options?: { confirm?: boolean },
	): Promise<void> => this.client.setConfigOption(configId, value, options);

	respondToUsageLimit = (action: UsageLimitAction): Promise<void> =>
		this.client.respondToUsageLimit(action);

	readonly queue = {
		remove: (itemId: string): Promise<void> =>
			this.client.removeQueuedPrompt(itemId),
		steer: (itemId: string): Promise<void> =>
			this.client.steerQueuedPrompt(itemId),
		update: (itemId: string, content: UserContent[]): Promise<void> =>
			this.client.updateQueuedPrompt(itemId, content),
		resume: (): Promise<void> => this.client.resumeQueue(),
	};

	loadOlder = async (): Promise<void> => {
		const before = this.nextBefore;
		if (!before || this.loadingOlder) return;
		const generation = this.generation;
		this.loadingOlder = true;
		this.olderFailed = false;
		this.publish();
		const page = await this.client
			.getItems({ before, limit: this.pageSize })
			.catch(() => null);
		if (this.generation !== generation) return;
		this.loadingOlder = false;
		if (!page?.ok) {
			this.olderFailed = true;
			this.publish();
			return;
		}
		this.nextBefore = page.nextBefore;
		const older = reduceMany(emptySnapshot(), page.envelopes);
		this.live = {
			...this.live,
			turns: new Map([...older.turns, ...this.live.turns]),
			items: new Map([...older.items, ...this.live.items]),
		};
		this.publish();
	};

	/** Fetches the bodies an outline left out, once each. */
	requestItemBodies = (itemIds: readonly string[]): void => {
		for (const id of itemIds) {
			if (this.requestedBodies.has(id)) continue;
			this.requestedBodies.add(id);
			this.bodyQueue.push(id);
		}
		if (this.bodyFlushQueued || this.bodyQueue.length === 0) return;
		this.bodyFlushQueued = true;
		queueMicrotask(() => {
			this.bodyFlushQueued = false;
			const queued = this.bodyQueue;
			this.bodyQueue = [];
			const seedGeneration = this.seedGeneration;
			const current = () => this.seedGeneration === seedGeneration;
			for (let i = 0; i < queued.length; i += MAX_BODIES_PER_REQUEST) {
				const chunk = queued.slice(i, i + MAX_BODIES_PER_REQUEST);
				const retry = () => {
					if (!current()) return;
					const again: string[] = [];
					for (const id of chunk) {
						this.requestedBodies.delete(id);
						const attempts = (this.bodyAttempts.get(id) ?? 0) + 1;
						this.bodyAttempts.set(id, attempts);
						if (attempts < MAX_BODY_ATTEMPTS) again.push(id);
					}
					if (again.length === 0) return;
					const attempt = this.bodyAttempts.get(again[0] ?? "") ?? 1;
					this.wait(
						() => {
							if (current()) this.requestItemBodies(again);
						},
						DEFAULT_BACKOFF_INITIAL_MS * 2 ** attempt,
					);
				};
				this.client.getItemBodies(chunk).then((result) => {
					if (!current()) return;
					if (!result.ok) return retry();
					this.live = withItemBodies(this.live, result.items);
					this.publish();
				}, retry);
			}
		});
	};

	private enqueue(envelope: Envelope): void {
		this.pending.push(envelope);
		if (!this.cancelFlush) {
			this.cancelFlush = this.scheduler(() => this.commit());
		}
	}

	private commit(): void {
		this.cancelFlush = null;
		const batch = this.pending;
		this.pending = [];
		if (batch.length === 0) return;
		for (const envelope of batch) {
			if (!isDurableEnvelope(envelope) || envelope.event.type !== "item")
				continue;
			const item = envelope.event.item;
			if (item.kind !== "user_message") continue;
			const clientId = (item as UserMessage).clientId;
			if (clientId) this.outbox.confirm(clientId);
		}
		this.resyncBuffer?.push(...batch);
		this.live = reduceMany(this.live, batch);
		this.publish();
		if (this.live.pendingReset) void this.resync();
	}

	private applySeed(
		seed: Seed,
		merge: boolean,
		arrived: readonly Envelope[] = [],
	): SessionSnapshot | null {
		const requested = this.requestedBodies;
		this.requestedBodies = new Set();
		this.bodyAttempts = new Map();
		this.seedGeneration += 1;
		if (seed.kind === "outline") {
			this.nextBefore = null;
			const seeded = reduceMany(
				seed.snapshot,
				newerThan(seed.snapshot, arrived),
			);
			this.live = seeded;
			const stillOmitted = [...requested].filter((id) => {
				const stored = seeded.items.get(id);
				return stored !== undefined && hasOmittedBody(stored.item);
			});
			if (stillOmitted.length > 0) this.requestItemBodies(stillOmitted);
			return seeded;
		}
		this.nextBefore = seed.nextBefore;
		const base = merge ? this.live : emptySnapshot();
		this.live = reduceMany(
			{ ...base, cursor: null, pendingReset: null },
			seed.envelopes,
		);
		return merge ? null : this.live;
	}

	private async resync(afterReset = false): Promise<void> {
		if (this.resyncing) {
			if (afterReset) this.resyncAgain = true;
			return;
		}
		this.resyncing = true;
		const generation = this.generation;
		try {
			do {
				this.resyncAgain = false;
				this.resyncBuffer = [];
				const seed = await fetchSeed(this.client, this.pageSize).catch(
					() => null,
				);
				if (this.generation !== generation) return;
				const seeded = seed
					? this.applySeed(seed, true, this.resyncBuffer)
					: null;
				this.publish();
				if (seeded?.pendingReset) this.resyncAgain = true;
			} while (this.resyncAgain);
		} finally {
			this.resyncing = false;
			this.resyncBuffer = null;
		}
	}

	private shown(): SessionSnapshot {
		const { stored, live } = this;
		if (!stored) return live;
		const merged = this.merged;
		if (
			merged &&
			merged.stored === stored &&
			merged.live.items === live.items &&
			merged.live.turns === live.turns &&
			merged.live.cursor?.epoch === live.cursor?.epoch
		) {
			const kept = merged.result;
			return {
				...live,
				session: live.session ?? stored.session,
				items: kept.items,
				turns: kept.turns,
			};
		}
		const result = withStoredHistory(stored, live);
		this.merged = { stored, live, result };
		return result;
	}

	private computeState(): ChatState {
		const shown = this.shown();
		const queued: UserMessage[] = [];
		for (const { item } of shown.items.values() as Iterable<StoredItem>) {
			if (item.kind === "user_message" && (item as UserMessage).queued)
				queued.push(item as UserMessage);
		}
		if (!sameList(this.queued, queued)) this.queued = queued;
		const paused = shown.session?.queuePaused === true;
		const previous = this.state as ChatState | undefined;
		const queue =
			previous &&
			previous.queue.prompts === this.queued &&
			previous.queue.paused === paused
				? previous.queue
				: { prompts: this.queued, paused };
		return {
			status: !this.loaded
				? "loading"
				: runningTurnId(shown.turns)
					? "running"
					: "ready",
			session: shown.session,
			turns: this.deriveTurns(shown, this.outbox.snapshot()),
			queue,
			older: this.loadingOlder
				? "loading"
				: this.olderFailed
					? "failed"
					: this.nextBefore
						? "more"
						: "none",
		};
	}

	private publish(): void {
		const next = this.computeState();
		const previous = this.state;
		if (
			previous.status === next.status &&
			previous.session === next.session &&
			previous.turns === next.turns &&
			previous.queue === next.queue &&
			previous.older === next.older
		) {
			return;
		}
		this.state = next;
		for (const listener of this.listeners) listener();
	}
}
