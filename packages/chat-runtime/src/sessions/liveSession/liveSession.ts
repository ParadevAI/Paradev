import { randomUUID } from "node:crypto";
import { CONTINUE_PROMPT } from "@superset/chat/core";
import {
	type DiscoverSessionsResult,
	type DurableEvent,
	type Envelope,
	type SessionState,
	sessionStateSchema,
	type Turn,
	type UsageLimit,
	type UsageLimitAction,
	type UserContent,
	type UserMessage,
	wrapHiddenText,
} from "@superset/chat/protocol";
import type { SessionCheckpoints } from "../../checkpoints";
import type {
	AdapterEvent,
	DiscoverNativeSessionsInput,
	HarnessAdapter,
	HarnessStartOptions,
} from "../../harness";
import type { ChatJournal } from "../../journal";

export type LiveSessionOptions = {
	sessionId: string;
	scopeId: string;
	cwd?: string;
	harness: string;
	terminalId?: string;
	journal: ChatJournal;
	publish: (envelope: Envelope) => void;
	adapter: HarnessAdapter;
	checkpoints?: SessionCheckpoints;
	mintId?: () => string;
	now?: () => number;
	/** How long after a usage limit's reset the host waits before continuing. */
	usageLimitGraceMs?: number;
};

/** Providers can still refuse right at the reset; give them a moment. */
export const USAGE_LIMIT_GRACE_MS = 30_000;

/** The most a timer can wait; a reset further out is re-armed when it fires. */
const MAX_TIMER_MS = 2_147_483_647;

/** Adapters that only see the refusal as an error carry its text. */
const USAGE_LIMIT_TEXT =
	/(?:usage|spending|monthly|weekly|daily) limit (?:reached|exceeded)|(?:quota|credits?) (?:exceeded|exhausted|depleted)|insufficient[_ ](?:quota|credits)|hit your (?:usage )?limit|credit balance is too low/i;

const CONTINUE: UserContent[] = [{ type: "text", text: CONTINUE_PROMPT }];

export type PromptResult = {
	itemId: string;
	queued: boolean;
};

export type QueueState = {
	paused: boolean;
	prompts: {
		itemId: string;
		clientId: string | undefined;
		content: UserContent[];
		/** `content` plus the hidden parts it leaves out. */
		fullContent: UserContent[];
		queuedAtMs: number;
	}[];
};

export type UnfinishedSession = {
	sessionId: string;
	scopeId: string;
	harness: string;
	harnessSessionId: string;
	terminalId?: string;
	modeId?: string;
	modelId?: string;
	interrupted: boolean;
	prompts: UserContent[][];
	pausedPrompts: UserContent[][];
};

type PendingPrompt = {
	item: UserMessage;
	content: UserContent[];
	/** The content as the caller gave it, hidden parts included. */
	typed?: UserContent[];
	turnId: string;
	seq: number;
	snapshotWorktree?: boolean;
	/** The worktree snapshot taken just before the prompt was sent. */
	before?: string | null;
};

function withoutQueued(item: UserMessage): UserMessage {
	const next = { ...item };
	delete next.queued;
	return next;
}

function withHiddenWrapped(content: UserContent[]): UserContent[] {
	return content.map((part) =>
		part.type === "text" && part.hidden
			? { type: "text" as const, text: wrapHiddenText(part.text) }
			: part,
	);
}

export class LiveSession {
	private readonly queue: PendingPrompt[] = [];
	private readonly pendingSteers: PendingPrompt[] = [];
	private steering: Promise<void> = Promise.resolve();
	private sent = 0;
	private awaitingTurn: PendingPrompt | null = null;
	private capturing: PendingPrompt | null = null;
	private readonly checkpointedTurns = new Set<string>();
	private readonly turnAnchors = new Map<string, string>();
	private steerTarget: string | null = null;
	private queuePaused = false;
	private limitedTurnId: string | null = null;
	private resumeTimer: ReturnType<typeof setTimeout> | null = null;
	private sessionState: SessionState;
	private currentTurn: Turn | null = null;
	private pump: Promise<void> | null = null;
	private stopped = false;
	private heldUntilStarted: UserContent[][] = [];
	private heldPaused: UserContent[][] = [];
	private onHeldReleased: (() => void) | null = null;
	private carriedFailure: Turn | null = null;
	private carriedAtMs: number | null = null;
	private readonly turnStarts = new Map<string, number>();
	/** Replays stamp items ahead of the clock to keep their order. */
	private latestStartMs = 0;
	/** Turns a user prompt started, and those of them that have shown anything yet. */
	private readonly promptedTurns = new Set<string>();
	private readonly turnsWithOutput = new Set<string>();
	/** False when the agent died before it reported any other status. */
	private readonly started: Promise<boolean>;
	private settleStarted: (started: boolean) => void = () => {};

	constructor(private readonly options: LiveSessionOptions) {
		this.sessionState = { status: "starting", harness: options.harness };
		this.started = new Promise((resolve) => {
			this.settleStarted = resolve;
		});
	}

	get sessionId(): string {
		return this.options.sessionId;
	}

	get scopeId(): string {
		return this.options.scopeId;
	}

	get terminalId(): string | undefined {
		return this.options.terminalId;
	}

	get cwd(): string | undefined {
		return this.options.cwd;
	}

	get busy(): boolean {
		return this.isBusy();
	}

	get harness(): string {
		return this.options.harness;
	}

	supportsNativeDiscovery(): boolean {
		return typeof this.options.adapter.discoverSessions === "function";
	}

	discoverSessions(
		input: DiscoverNativeSessionsInput,
	): Promise<DiscoverSessionsResult> {
		const discover = this.options.adapter.discoverSessions;
		if (!discover) return Promise.resolve({ supported: false, sessions: [] });
		return discover.call(this.options.adapter, input);
	}

	get state(): SessionState {
		return this.sessionState;
	}

	get turn(): Turn | null {
		return this.currentTurn;
	}

	get queuedCount(): number {
		return this.queue.length;
	}

	unfinished(): UnfinishedSession | null {
		const harnessSessionId = this.sessionState.harnessSessionId;
		if (!harnessSessionId || this.sessionState.status === "dead") return null;
		const interrupted =
			this.currentTurn?.status === "running" ||
			(this.sessionState.backgroundTasks?.length ?? 0) > 0;
		const inFlight = this.inFlight();
		const prompts = [
			...(inFlight ? [inFlight] : []),
			...this.pendingSteers,
			...(this.queuePaused ? [] : this.queue),
		]
			.map((pending) => pending.content)
			.concat(this.heldUntilStarted);
		const pausedPrompts = (this.queuePaused ? this.queue : [])
			.map((pending) => pending.content)
			.concat(this.heldPaused);
		if (!interrupted && prompts.length === 0 && pausedPrompts.length === 0) {
			return null;
		}
		return {
			sessionId: this.options.sessionId,
			scopeId: this.options.scopeId,
			harness: this.options.harness,
			harnessSessionId,
			terminalId: this.options.terminalId,
			modeId: this.sessionState.modeId,
			modelId: this.sessionState.modelId,
			interrupted,
			prompts,
			pausedPrompts,
		};
	}

	promptOnceStarted(
		prompts: UserContent[][],
		pausedPrompts: UserContent[][] = [],
		onReleased?: () => void,
	): void {
		this.heldUntilStarted.push(...prompts);
		this.heldPaused.push(...pausedPrompts);
		this.onHeldReleased = onReleased ?? null;
		this.releaseHeldPrompts();
	}

	/**
	 * Shows `turn`, a failure that ended the chat this one replaces, once the
	 * agent has started: after any history it replays, so it reads as the
	 * latest turn.
	 */
	carryFailedTurn(turn: Turn): void {
		this.carriedFailure = turn;
		this.releaseCarriedFailure();
	}

	start(startOptions: HarnessStartOptions): void {
		this.emitSession({ status: "starting", queueControls: true });
		this.pump = this.run(this.options.adapter.start(startOptions)).catch(
			(error: unknown) => {
				try {
					this.fail(error);
				} catch {
					this.stopped = true;
				}
			},
		);
	}

	prompt(
		content: UserContent[],
		clientId: string,
		options: { steerTurnId?: string; snapshotWorktree?: boolean } = {},
	): PromptResult {
		const { steerTurnId, snapshotWorktree } = options;
		const itemId = this.mintId();
		const seq = ++this.sent;
		const shown = content.filter(
			(part) => !(part.type === "text" && part.hidden),
		);
		const sent = withHiddenWrapped(content);
		const wantsSteer =
			steerTurnId !== undefined ||
			this.sessionState.awaitingBackground === true;
		const running =
			wantsSteer && this.queue.length === 0
				? this.steerableTurn(steerTurnId)
				: null;
		if (running) {
			const item: UserMessage = {
				id: itemId,
				kind: "user_message",
				clientId,
				startedAtMs: this.now(),
				content: shown,
			};
			this.injectInto(running, {
				item,
				content: sent,
				turnId: this.mintId(),
				seq,
				snapshotWorktree,
			});
			return { itemId, queued: false };
		}
		const limited = this.sessionState.usageLimit !== undefined;
		const queued = this.isBusy() || limited;
		const item: UserMessage = {
			id: itemId,
			kind: "user_message",
			clientId,
			startedAtMs: this.now(),
			content: shown,
			...(queued ? { queued: true } : {}),
		};
		const turnId = this.mintId();
		if (queued) {
			this.queue.push({
				item,
				content: sent,
				typed: content,
				turnId,
				seq,
				snapshotWorktree,
			});
			this.appendDurable({ type: "item", item, turnId });
			if (limited && !this.queuePaused) {
				this.queuePaused = true;
				this.emitSession({ queuePaused: true, queuePausedByLimit: true });
			}
			if (
				steerTurnId &&
				this.currentTurn?.id === steerTurnId &&
				this.currentTurn.status === "running"
			) {
				this.steerQueued(itemId);
			}
			return { itemId, queued: true };
		}
		this.appendDurable({ type: "item", item, turnId });
		this.deliver({ item, content: sent, turnId, seq, snapshotWorktree });
		return { itemId, queued: false };
	}

	/** Writes finished turns and items from another session's transcript into this one. */
	seed(events: DurableEvent[]): void {
		for (const event of events) this.appendDurable(event);
	}

	removeQueued(itemId: string): void {
		const index = this.requireQueuedIndex(itemId);
		const [removed] = this.queue.splice(index, 1);
		if (!removed) return;
		if (this.steerTarget === itemId) this.steerTarget = null;
		this.discard(removed);
		this.unpauseIfEmpty();
	}

	updateQueued(itemId: string, content: UserContent[]): void {
		const pending = this.queue[this.requireQueuedIndex(itemId)];
		if (!pending) return;
		pending.content = content;
		pending.item = { ...pending.item, content };
		this.appendDurable({
			type: "item",
			item: pending.item,
			turnId: pending.turnId,
		});
	}

	steerQueued(itemId: string): void {
		const index = this.requireQueuedIndex(itemId);
		const [steered] = this.queue.splice(index, 1);
		if (!steered) return;
		const running = this.steerableTurn();
		if (running) {
			if (this.steerTarget === itemId) this.steerTarget = null;
			if (this.queuePaused) {
				this.queuePaused = false;
				this.emitSession({ queuePaused: false });
			}
			this.injectInto(
				running,
				{ ...steered, item: this.delivered(steered.item) },
				true,
			);
			return;
		}
		this.steerFirst(steered);
	}

	private steerFirst(steered: PendingPrompt): void {
		this.queue.unshift(steered);
		if (this.queuePaused) {
			this.queuePaused = false;
			this.emitSession({ queuePaused: false });
		}
		if (this.currentTurn?.status === "running") {
			this.steerTarget = steered.item.id;
			this.options.adapter.cancelTurn();
		} else if (this.inFlight()) {
			this.steerTarget = steered.item.id;
		} else {
			this.queue.shift();
			this.deliver(steered);
		}
	}

	get queueState(): QueueState {
		return {
			paused: this.queuePaused,
			prompts: this.queue.map(({ item, typed }) => ({
				itemId: item.id,
				clientId: item.clientId,
				content: item.content,
				fullContent: typed ?? item.content,
				queuedAtMs: item.startedAtMs,
			})),
		};
	}

	resumeQueue(): void {
		const limited = this.sessionState.usageLimit !== undefined;
		if (!this.queuePaused && !limited) return;
		this.clearResumeTimer();
		this.queuePaused = false;
		this.emitSession({ queuePaused: false, usageLimit: undefined });
		if (this.currentTurn?.status !== "running" && !this.inFlight()) {
			this.deliverNextQueued();
		}
	}

	/**
	 * Resuming after a limit continues the work the refusal cut short: the
	 * next queued prompt if there is one, else a plain "Continue".
	 */
	respondToUsageLimit(action: UsageLimitAction): void {
		const limit = this.sessionState.usageLimit;
		if (this.stopped || !limit) return;
		switch (action) {
			case "resume":
				this.resumeAfterLimit();
				return;
			case "dismiss":
				this.clearResumeTimer();
				this.emitSession({ usageLimit: undefined });
				return;
			case "resume_at_reset":
				if (limit.resetsAtMs === undefined) return;
				this.emitSession({
					usageLimit: {
						...limit,
						resumeAtReset: true,
						resumesAtMs: limit.resetsAtMs + this.usageLimitGraceMs(),
					},
				});
				this.armResumeTimer(limit.resetsAtMs);
				return;
			case "cancel_resume_at_reset": {
				this.clearResumeTimer();
				const { resumesAtMs: _cancelled, ...rest } = limit;
				this.emitSession({ usageLimit: { ...rest, resumeAtReset: false } });
				return;
			}
		}
	}

	private resumeAfterLimit(): void {
		const idle = this.currentTurn?.status !== "running" && !this.inFlight();
		this.resumeQueue();
		if (idle && this.queue.length === 0 && !this.inFlight()) {
			this.prompt(CONTINUE, this.mintId());
		}
	}

	private usageLimitGraceMs(): number {
		return this.options.usageLimitGraceMs ?? USAGE_LIMIT_GRACE_MS;
	}

	private armResumeTimer(resetsAtMs: number): void {
		this.clearResumeTimer();
		const grace = this.usageLimitGraceMs();
		const wait = resetsAtMs + grace - this.now();
		this.resumeTimer = setTimeout(
			() => {
				this.resumeTimer = null;
				if (this.stopped || !this.sessionState.usageLimit?.resumeAtReset) {
					return;
				}
				if (this.now() < resetsAtMs + grace) {
					this.armResumeTimer(resetsAtMs);
					return;
				}
				try {
					this.resumeAfterLimit();
				} catch (error) {
					this.fail(error);
				}
			},
			Math.min(Math.max(wait, 0), MAX_TIMER_MS),
		);
	}

	private clearResumeTimer(): void {
		if (this.resumeTimer === null) return;
		clearTimeout(this.resumeTimer);
		this.resumeTimer = null;
	}

	/** A refused turn stops the queue until someone chooses to go on. */
	private limitReached(limit: UsageLimit): void {
		this.limitedTurnId = this.currentTurn?.id ?? null;
		const pausing = this.queue.length > 0 && !this.queuePaused;
		if (pausing) this.queuePaused = true;
		this.emitSession({
			queuePaused: this.queuePaused,
			usageLimit: limit,
			...(pausing ? { queuePausedByLimit: true } : {}),
		});
	}

	/** A failed turn the limit refused carries the limit's kind, whichever harness reported it. */
	private withLimitKind(turn: Turn): Turn {
		if (turn.status !== "failed" || !turn.error) return turn;
		if (turn.error.kind === "usage_limit") return turn;
		const limited =
			turn.id === this.limitedTurnId ||
			USAGE_LIMIT_TEXT.test(turn.error.message);
		return limited
			? { ...turn, error: { ...turn.error, kind: "usage_limit" } }
			: turn;
	}

	cancelTurn(turnId?: string, pauseQueue = false): void {
		const capturing = this.capturing;
		if (capturing && this.currentTurn?.status !== "running") {
			this.capturing = null;
			this.discard(capturing);
			if (pauseQueue && this.queue.length > 0 && !this.queuePaused) {
				this.queuePaused = true;
				this.emitSession({ queuePaused: true, queuePausedByLimit: false });
				return;
			}
			this.emitSession({});
			this.deliverNextQueued();
			return;
		}
		if (turnId && this.currentTurn && this.currentTurn.id !== turnId) return;
		const steering =
			this.steerTarget !== null && this.queue[0]?.item.id === this.steerTarget;
		const waiting = this.queue.length + this.pendingSteers.length;
		if (pauseQueue && !steering && waiting > 0 && !this.queuePaused) {
			this.queuePaused = true;
			this.emitSession({ queuePaused: true, queuePausedByLimit: false });
		}
		this.options.adapter.cancelTurn();
	}

	respondToApproval(
		approvalId: string,
		decision: Parameters<HarnessAdapter["respondToApproval"]>[1],
	): void {
		this.options.adapter.respondToApproval(approvalId, decision);
	}

	setMode(modeId: string): void {
		this.options.adapter.setMode(modeId);
	}

	setConfigOption(configId: string, value: string): Promise<boolean> {
		if (!this.options.adapter.setConfigOption) {
			throw new Error("this agent has no settings to change");
		}
		return this.options.adapter.setConfigOption(configId, value);
	}

	stopBackgroundTask(taskId: string): Promise<boolean> {
		return (
			this.options.adapter.stopBackgroundTask?.(taskId) ??
			Promise.resolve(false)
		);
	}

	steerSubagent(taskId: string, content: UserContent[]): Promise<boolean> {
		return (
			this.options.adapter.steerSubagent?.(
				taskId,
				withHiddenWrapped(content),
			) ?? Promise.resolve(false)
		);
	}

	backgroundSubagent(taskId: string): Promise<boolean> {
		return (
			this.options.adapter.backgroundSubagent?.(taskId) ??
			Promise.resolve(false)
		);
	}

	/** An agent has no session to copy until it has started. */
	async fork(cut?: { upToMessageId: string }): Promise<string | null> {
		if (!this.options.adapter.fork || !(await this.started)) return null;
		return this.options.adapter.fork(cut);
	}

	async dispose(): Promise<void> {
		this.settleStarted(false);
		this.stopped = true;
		this.clearResumeTimer();
		if (this.currentTurn?.status === "running") {
			this.settleCheckpoint(this.currentTurn.id);
		}
		this.discardPending();
		await this.options.adapter.dispose();
		await this.pump;
	}

	private async run(stream: AsyncIterable<AdapterEvent>): Promise<void> {
		try {
			for await (const event of stream) {
				if (this.stopped) return;
				this.handle(event);
			}
		} finally {
			this.settleStarted(false);
			this.stopped = true;
			this.clearResumeTimer();
		}
	}

	private handle(event: AdapterEvent): void {
		switch (event.kind) {
			case "item":
				if (event.item.kind !== "user_message") {
					this.turnsWithOutput.add(event.turnId);
				}
				if (
					event.item.kind === "tool_call" &&
					this.checkpointedTurns.has(event.turnId) &&
					!this.turnAnchors.has(event.turnId)
				) {
					this.turnAnchors.set(event.turnId, event.item.id);
				}
				this.appendDurable({
					type: "item",
					item: event.item,
					turnId: event.turnId,
				});
				return;
			case "turn": {
				const previous = this.currentTurn;
				this.currentTurn = this.withLimitKind(
					this.afterCarriedFailure(event.turn),
				);
				this.appendDurable({ type: "turn", turn: this.currentTurn });
				if (
					previous?.id === event.turn.id &&
					previous.status === event.turn.status
				)
					return;
				const limitText =
					event.turn.status === "failed" &&
					USAGE_LIMIT_TEXT.test(event.turn.error?.message ?? "");
				if (limitText && !this.sessionState.usageLimit) {
					this.limitReached({ hitAtMs: this.now() });
				}
				if (event.turn.status === "running") {
					this.attributeAwaitingPrompt(event.turn.id);
					const steered = this.steerTarget;
					this.steerTarget = null;
					if (steered && this.queue[0]?.item.id === steered) {
						this.options.adapter.cancelTurn();
					}
				} else {
					this.noteSilentTurn(event.turn);
					this.settleCheckpoint(event.turn.id);
					this.deliverNextQueued();
				}
				return;
			}
			case "session":
				if (event.session.status === "dead") {
					this.stopped = true;
					this.clearResumeTimer();
					this.discardPending();
				}
				if (event.session.status && event.session.status !== "starting") {
					this.settleStarted(event.session.status !== "dead");
				}
				if (event.session.usageLimit) {
					const { usageLimit, ...rest } = event.session;
					this.emitSession(rest);
					this.limitReached(usageLimit);
				} else {
					this.emitSession(event.session);
				}
				this.releaseCarriedFailure();
				this.releaseHeldPrompts();
				if (event.session.awaitingBackground) this.steerQueueIntoHeldTurn();
				return;
			case "delta":
				this.options.publish({
					v: 1,
					sessionId: this.options.sessionId,
					ts: this.now(),
					delta: event.delta,
				});
				return;
		}
	}

	private releaseCarriedFailure(): void {
		const turn = this.carriedFailure;
		if (!turn || this.sessionState.status === "starting") return;
		this.carriedFailure = null;
		const at = Math.max(this.now(), this.latestStartMs + 1);
		this.carriedAtMs = at;
		this.appendDurable({
			type: "turn",
			turn: { ...turn, startedAtMs: at, completedAtMs: at },
		});
		this.appendDurable({
			type: "item",
			item: {
				id: this.mintId(),
				kind: "notice",
				noticeKind: "error",
				text: turn.error?.message ?? "",
				startedAtMs: at,
				completedAtMs: at,
			},
			turnId: turn.id,
		});
	}

	/**
	 * After a long replay the agent's clock gives new turns starts at or before
	 * the carried failure's, and a tie sorts at random. Each new turn starts
	 * after everything written so far, decided once so its later events agree.
	 */
	private afterCarriedFailure(turn: Turn): Turn {
		if (this.carriedAtMs === null) return turn;
		let startedAtMs = this.turnStarts.get(turn.id);
		if (startedAtMs === undefined) {
			startedAtMs = Math.max(turn.startedAtMs, this.latestStartMs + 1);
			this.turnStarts.set(turn.id, startedAtMs);
		}
		return startedAtMs === turn.startedAtMs ? turn : { ...turn, startedAtMs };
	}

	private releaseHeldPrompts(): void {
		const status = this.sessionState.status;
		if (status === "starting") return;
		const held = this.heldUntilStarted.splice(0);
		const paused = this.heldPaused.splice(0);
		const onReleased = this.onHeldReleased;
		this.onHeldReleased = null;
		if (status === "dead") return;
		onReleased?.();
		this.queue.unshift(...held.map((content) => this.queuedPrompt(content)));
		if (this.currentTurn?.status !== "running" && !this.inFlight()) {
			this.deliverNextQueued();
		}
		if (paused.length === 0) return;
		this.queue.push(...paused.map((content) => this.queuedPrompt(content)));
		if (!this.queuePaused) {
			this.queuePaused = true;
			this.emitSession({ queuePaused: true, queuePausedByLimit: false });
		}
	}

	private queuedPrompt(content: UserContent[]): PendingPrompt {
		const item: UserMessage = {
			id: this.mintId(),
			kind: "user_message",
			clientId: this.mintId(),
			startedAtMs: this.now(),
			content,
			queued: true,
		};
		const turnId = this.mintId();
		this.appendDurable({ type: "item", item, turnId });
		return { item, content, turnId, seq: ++this.sent };
	}

	/** A turn that ends as if it worked but shows nothing would otherwise read as success. */
	private noteSilentTurn(turn: Turn): void {
		const prompted = this.promptedTurns.delete(turn.id);
		const showed = this.turnsWithOutput.delete(turn.id);
		if (!prompted || showed || turn.status !== "completed") return;
		const at = this.now();
		this.appendDurable({
			type: "item",
			item: {
				id: this.mintId(),
				kind: "notice",
				noticeKind: "error",
				text: "The agent finished without replying. It may have failed to reach its model.",
				startedAtMs: at,
				completedAtMs: at,
			},
			turnId: turn.id,
		});
	}

	private attributeAwaitingPrompt(turnId: string): void {
		const awaiting = this.awaitingTurn;
		if (!awaiting) return;
		this.promptedTurns.add(turnId);
		this.awaitingTurn = null;
		if (this.options.checkpoints) {
			this.checkpointedTurns.add(turnId);
			this.options.checkpoints.turnStarted(turnId, awaiting.before ?? null);
		}
		this.appendDurable({
			type: "item",
			item: withoutQueued(awaiting.item),
			turnId,
		});
	}

	/** The prompt on its way to the agent: being snapshotted for, or sent and awaiting its turn. */
	private inFlight(): PendingPrompt | null {
		return this.awaitingTurn ?? this.capturing;
	}

	private deliver(prompt: PendingPrompt): void {
		const checkpoints = this.options.checkpoints;
		if (!checkpoints || !prompt.snapshotWorktree) {
			this.awaitingTurn = prompt;
			this.send(prompt);
			return;
		}
		this.capturing = prompt;
		void checkpoints
			.capture()
			.catch((error: unknown) => {
				console.warn("[chat-runtime] checkpoint failed", error);
				return null;
			})
			.then((before) => {
				if (this.capturing !== prompt) return;
				this.capturing = null;
				if (this.stopped) return;
				if (this.currentTurn?.status === "running") {
					this.requeueFirst(prompt);
					return;
				}
				prompt.before = before;
				this.awaitingTurn = prompt;
				try {
					this.send(prompt);
				} catch (error) {
					this.refuse(prompt, error);
				}
			});
	}

	/** The agent turned down a prompt sent after its snapshot, when no caller waits on it any more. */
	private refuse(prompt: PendingPrompt, error: unknown): void {
		if (!prompt.item.queued) this.discard(prompt);
		const at = this.now();
		this.appendDurable({
			type: "item",
			item: {
				id: this.mintId(),
				kind: "notice",
				noticeKind: "error",
				text: error instanceof Error ? error.message : String(error),
				startedAtMs: at,
				completedAtMs: at,
			},
			turnId: prompt.turnId,
		});
		this.emitSession({});
		try {
			this.deliverNextQueued();
		} catch (next) {
			this.fail(next);
		}
	}

	/** The agent started a turn of its own meanwhile; the prompt waits for it to end. */
	private requeueFirst(prompt: PendingPrompt): void {
		const item: UserMessage = { ...prompt.item, queued: true };
		this.appendDurable({ type: "item", item, turnId: prompt.turnId });
		this.queue.unshift({ ...prompt, item });
		this.emitSession({});
	}

	private settleCheckpoint(turnId: string): void {
		if (!this.checkpointedTurns.delete(turnId)) return;
		const itemId = this.turnAnchors.get(turnId);
		this.turnAnchors.delete(turnId);
		const harnessSessionId = this.sessionState.harnessSessionId;
		this.options.checkpoints?.turnSettled(
			turnId,
			itemId && harnessSessionId ? { harnessSessionId, itemId } : undefined,
		);
	}

	private send(prompt: PendingPrompt): void {
		try {
			this.options.adapter.prompt(prompt.content);
		} catch (error) {
			this.awaitingTurn = null;
			if (prompt.item.queued) this.discard(prompt);
			throw error;
		}
	}

	private steerableTurn(expectedTurnId?: string): Turn | null {
		const turn = this.currentTurn;
		if (turn?.status !== "running" || this.inFlight()) return null;
		if (expectedTurnId && expectedTurnId !== turn.id) return null;
		return this.options.adapter.canSteer?.() ? turn : null;
	}

	private delivered(item: UserMessage): UserMessage {
		return { ...withoutQueued(item), startedAtMs: this.now() };
	}

	private steerQueueIntoHeldTurn(): void {
		if (this.queuePaused) return;
		const turn = this.steerableTurn();
		if (!turn) return;
		for (const queued of this.queue.splice(0)) {
			if (this.steerTarget === queued.item.id) this.steerTarget = null;
			this.injectInto(turn, { ...queued, item: this.delivered(queued.item) });
		}
	}

	private injectInto(
		turn: Turn,
		prompt: PendingPrompt,
		selected = false,
	): void {
		this.appendDurable({ type: "item", item: prompt.item, turnId: turn.id });
		this.pendingSteers.push(prompt);
		this.steering = this.steering.then(async () => {
			if (this.stopped) return;
			const mayDispatch =
				this.currentTurn?.id === turn.id &&
				(selected || (this.queue.length === 0 && !this.queuePaused));
			const taken =
				mayDispatch &&
				(await Promise.resolve(this.options.adapter.steer?.(prompt.content))
					.then(Boolean)
					.catch(() => false));
			const index = this.pendingSteers.indexOf(prompt);
			if (index === -1) return;
			this.pendingSteers.splice(index, 1);
			if (!taken) this.fallBack(prompt, selected);
			if (this.currentTurn?.status !== "running" && !this.inFlight()) {
				this.deliverNextQueued();
			}
		});
	}

	private fallBack(prompt: PendingPrompt, selected: boolean): void {
		const item: UserMessage = { ...prompt.item, queued: true };
		const pending = { ...prompt, item };
		this.appendDurable({ type: "item", item, turnId: prompt.turnId });
		if (selected) {
			this.steerFirst(pending);
			return;
		}
		const later = this.queue.findIndex(
			(queued) =>
				queued.seq > prompt.seq && queued.item.id !== this.steerTarget,
		);
		this.queue.splice(later === -1 ? this.queue.length : later, 0, pending);
	}

	private fail(error: unknown): void {
		this.settleStarted(false);
		this.stopped = true;
		this.clearResumeTimer();
		const failedAtMs = this.now();
		const turn = this.currentTurn;
		if (turn?.status === "running") {
			this.currentTurn = {
				...turn,
				status: "interrupted",
				completedAtMs: failedAtMs,
			};
			this.appendDurable({ type: "turn", turn: this.currentTurn });
			this.settleCheckpoint(turn.id);
		}
		this.discardPending();
		this.appendDurable({
			type: "item",
			item: {
				id: this.mintId(),
				kind: "notice",
				noticeKind: "error",
				text: error instanceof Error ? error.message : String(error),
				startedAtMs: failedAtMs,
				completedAtMs: failedAtMs,
			},
			turnId: turn?.id ?? this.mintId(),
		});
		this.emitSession({ status: "dead" });
	}

	private discard(prompt: PendingPrompt): void {
		this.appendDurable({
			type: "item",
			item: { ...withoutQueued(prompt.item), discarded: true },
			turnId: prompt.turnId,
		});
	}

	private discardPending(): void {
		const inFlight = this.inFlight();
		const pending = [
			...(inFlight?.item.queued ? [inFlight] : []),
			...this.pendingSteers,
			...this.queue,
		];
		this.queue.length = 0;
		this.pendingSteers.length = 0;
		this.awaitingTurn = null;
		this.capturing = null;
		this.steerTarget = null;
		for (const prompt of pending) this.discard(prompt);
	}

	private requireQueuedIndex(itemId: string): number {
		const index = this.queue.findIndex((pending) => pending.item.id === itemId);
		if (index === -1) throw new Error(`prompt ${itemId} is not queued`);
		return index;
	}

	private deliverNextQueued(): void {
		if (this.queuePaused || this.inFlight()) return;
		const next = this.queue.shift();
		if (!next) return;
		this.deliver(next);
	}

	private unpauseIfEmpty(): void {
		if (!this.queuePaused || this.queue.length > 0) return;
		this.queuePaused = false;
		this.emitSession({ queuePaused: false });
	}

	private emitSession(partial: Partial<SessionState>): void {
		const merged: SessionState = { ...this.sessionState, ...partial };
		const status = this.hasPendingWork() ? "running" : merged.status;
		this.sessionState = sessionStateSchema.parse({ ...merged, status });
		this.appendDurable({ type: "session", session: this.sessionState });
	}

	private appendDurable(event: DurableEvent): void {
		const startedAtMs =
			event.type === "item"
				? event.item.startedAtMs
				: event.type === "turn"
					? event.turn.startedAtMs
					: 0;
		this.latestStartMs = Math.max(this.latestStartMs, startedAtMs);
		this.options.publish(
			this.options.journal.appendEnvelope(this.options.sessionId, event),
		);
	}

	private hasPendingWork(): boolean {
		return (
			(this.queue.length > 0 && !this.queuePaused) || this.inFlight() !== null
		);
	}

	private isBusy(): boolean {
		return (
			this.currentTurn?.status === "running" ||
			this.hasPendingWork() ||
			this.pendingSteers.length > 0 ||
			this.heldUntilStarted.length > 0
		);
	}

	private mintId(): string {
		return (this.options.mintId ?? randomUUID)();
	}

	private now(): number {
		return (this.options.now ?? Date.now)();
	}
}
