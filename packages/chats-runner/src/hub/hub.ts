import type { SessionUpdate, StopReason } from "@agentclientprotocol/sdk";
import type {
	AgentSession,
	AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import { toAcpUpdates } from "../pi/event-map.ts";
import type { TurnPlugin } from "../plugins/plugins.ts";
import type { Rollover } from "../rollover/rollover.ts";
import type { ChatContext } from "../turn-input/turn-input.ts";
import {
	sameRun,
	TraceRecorder,
	type TurnTrace,
} from "../turn-trace/turn-trace.ts";

/** What a running turn is told mid-step: background work that ended, or what was said on a call (a steer). */
export type NoticeKind = "notice" | "steer";

/** Per-turn context the server sends with each turn (`meta` on `POST /turns`). */
export interface TurnContext {
	/** Extra env for the turn's commands, e.g. `DEV_GROUP_ID`. */
	env: Record<string, string>;
	/**
	 * The server's id for this turn, stamped on the turn's first update so a watcher can tell where it starts in a replay
	 * that also holds earlier turns.
	 */
	turnId?: string;
	/** The connected apps the Dev was given, with their accounts, for the prompt. */
	plugins?: TurnPlugin[];
	/** The turn is in the owner's 1:1 with their own Dev: the only chat where its private memory is loaded. */
	ownerOneToOne?: boolean;
	/** Another Dev asks this owner's Dev something: the private memory is loaded, under a rule to share only what was asked. */
	devAsk?: boolean;
	/** The chat's recent messages and roster; the input carries what the session doesn't hold yet. */
	chat?: ChatContext;
	/** The chat the turn is in; the API sends it for a trigger's session (`<chatId>.trigger-<triggerId>`), checked against the key. */
	chatId?: string;
	/** A chat's own turn (not an ask, an app's question, a trigger's or a visitor's): it may move work to the background. */
	canBackground?: boolean;
	/** A turn that answers with `reply` and was asked directly: asked once (REPLY_CHECK) when it ends with words but no reply. */
	checkReply?: boolean;
}

export interface TurnResult {
	stopReason: StopReason;
	/**
	 * The Dev's final text in the turn (see `finalText`): the API never posts it in the chat (a Dev replies with
	 * the `reply` tool); it's a task turn's note, a trigger turn's outcome, or the answer to whoever asked (`dev ask`).
	 */
	answer: string;
}

/** A chat's pi session plus what the hub must do around each turn; built by `openSession`. */
export interface OpenedSession {
	/** The chat's current pi session; a rollover replaces it. */
	readonly pi: Pick<
		AgentSession,
		"prompt" | "abort" | "messages" | "steer" | "clearQueue"
	>;
	/** The model ids that answered the latest turn (the session's model before any), recorded with its trace. */
	readonly model: string;
	/** Every event of the chat's pi sessions, across rollovers. */
	subscribe(listener: (event: AgentSessionEvent) => void): void;
	/** Updates the session adds to the turn's stream besides pi's own: its questions to the chat. */
	subscribeUpdates(listener: (update: SessionUpdate) => void): void;
	/** The running turn is being cancelled: whatever it waits on (a question) stops waiting. */
	cancelTurn(): void;
	/** Its chat is gone: its background helpers stop too (a newer message only cancels the turn). */
	stopJobs?(): void;
	/** Called before each prompt with that turn's context and the server's text; returns the input the agent reads. */
	startTurn(turn: TurnContext, text: string): Promise<string>;
	/** Called after each turn that wasn't cancelled: rolls the session over when it's full. */
	endTurn(outcome: { failed: boolean }): Promise<Rollover | null>;
}

type Listener = (update: SessionUpdate) => void;

/** `_meta` key on a turn's `user_message_chunk` carrying the server's turn id. */
const TURN_ID_META = "dev/turnId";
/** `_meta` keys on `compaction_update`s: pi's compaction (why it ran) and a rollover (what it did). */
const COMPACTION_META = "dev/compaction";
const ROLLOVER_META = "dev/rollover";

function modelError(messages: AgentSession["messages"]): string | null {
	const last = messages.findLast((m) => m.role === "assistant");
	if (!last || last.role !== "assistant" || last.stopReason !== "error")
		return null;
	return last.errorMessage || "the model returned an error";
}

/**
 * The text of the Dev's last message in the turn that just ran, trimmed; empty when the turn ended without one (it
 * only acted, or was aborted). Only messages after the turn's input count, so an earlier turn's words never come back;
 * after a compaction mid-turn the input may be gone, and everything left is this turn's. Subagents run in sessions of
 * their own: only their results, as tool output, reach this one.
 */
export function finalText(messages: AgentSession["messages"]): string {
	const start = messages.findLastIndex((m) => m.role === "user");
	const last = messages
		.slice(start + 1)
		.findLast((m) => m.role === "assistant");
	if (
		!last ||
		last.role !== "assistant" ||
		last.stopReason === "aborted" ||
		last.stopReason === "error"
	)
		return "";
	return last.content
		.flatMap((c) => (c.type === "text" ? [c.text] : []))
		.join("")
		.trim();
}

/** Enough for a watcher who connects mid-turn to see what happened so far; older updates are dropped first. */
const HISTORY_LIMIT = 500;

const CANCELLED: TurnResult = { stopReason: "cancelled", answer: "" };

/**
 * Asked once when a directly asked turn ends with words but no `reply`: models sometimes write their answer as final
 * text. Whether to speak stays the model's to decide. Not on a group's turns that overheard people, where final text is
 * mostly why the Dev stays quiet and asking made it post small talk (the server's `checksReply`).
 */
export const REPLY_CHECK =
	"(Dev) Your final text isn't shown to anyone. If it was your answer to someone here, send it now with `reply`. If it was why you're staying quiet (the message wasn't for you, or needs nothing from you), end now: no text and no tool calls. Don't add a reply just because you were asked.";

/** Whether a tool call posts the turn's reply: the `reply` tool, or `dev reply` run from bash. */
export function postsReply(toolName: string, args: unknown): boolean {
	if (toolName === "reply") return true;
	const command =
		toolName === "bash" && args && typeof args === "object"
			? (args as { command?: unknown }).command
			: null;
	return typeof command === "string" && /\bdev\s+reply\b/.test(command);
}

/**
 * One ACP session (= one group's conversation with this Dev): the pi session, every attached connection, and the
 * recent updates replayed to newcomers. Runs one turn at a time; a new prompt cancels the running turn and starts over.
 */
export class HubSession {
	private readonly listeners = new Set<Listener>();
	private readonly history: SessionUpdate[] = [];
	/** The turn in progress: settles when it's over; `cancelled` is set when it was stopped rather than finished. */
	private current: { done: Promise<void>; cancelled: boolean } | null = null;
	private generation = 0;
	/** Numbers pi's compactions and the rollovers, which watchers see as `compaction_update`s. */
	private compactions = 0;
	private recording: TraceRecorder | null = null;
	/** Finished turns' traces, until the settle callback takes them. */
	private readonly traces = new Map<string, TurnTrace>();
	/** Background notices and call steers handed to the running turn, until it has read them. */
	private notices: { text: string; kind: NoticeKind }[] = [];
	/** Whether the running turn has posted its reply. */
	private replied = false;

	/**
	 * `secrets`: values that must never reach a stored trace (the box's MCP header values). `redeliver`: where a notice
	 * or steer goes that the running turn ended without reading (as a turn of its own, framed by its kind).
	 */
	constructor(
		private readonly opened: OpenedSession,
		private readonly secrets: string[] = [],
		private readonly redeliver: (
			text: string,
			kind: NoticeKind,
		) => Promise<void> = async () => {},
	) {
		opened.subscribeUpdates((update) => this.emit(update));
		opened.subscribe((event) => {
			if (event.type === "compaction_start") this.compactions++;
			if (
				event.type === "compaction_start" ||
				event.type === "compaction_end"
			) {
				const status =
					event.type === "compaction_start"
						? "in_progress"
						: event.result
							? "completed"
							: event.aborted
								? "cancelled"
								: "failed";
				this.emit({
					sessionUpdate: "compaction_update",
					compactionId: `compaction-${this.compactions}`,
					status,
					_meta: { [COMPACTION_META]: { reason: event.reason } },
				});
				if (event.type === "compaction_end")
					console.log(
						`dev-runner: pi compacted a session (${event.reason}): ${status}`,
					);
				return;
			}
			if (
				event.type === "tool_execution_start" &&
				postsReply(event.toolName, event.args)
			)
				this.replied = true;
			for (const update of toAcpUpdates(event)) this.emit(update);
		});
	}

	/** Subscribes and returns the updates to replay first; synchronous so no live update can slip between the two. */
	attach(listener: Listener): { replay: SessionUpdate[]; detach: () => void } {
		this.listeners.add(listener);
		return {
			replay: [...this.history],
			detach: () => this.listeners.delete(listener),
		};
	}

	async prompt(text: string, turn: TurnContext): Promise<TurnResult> {
		const generation = ++this.generation;
		await this.cancel();
		// Another prompt arrived while we waited for the old turn to stop: that one wins.
		if (generation !== this.generation) return CANCELLED;

		const recording = new TraceRecorder({ secrets: this.secrets });
		this.recording = recording;
		const current = { done: Promise.resolve(), cancelled: false };
		this.current = current;
		const work = this.run(text, turn, current);
		current.done = work.then(
			() => {},
			() => {},
		);
		try {
			return await work;
		} catch (err) {
			if (current.cancelled) return CANCELLED;
			throw err;
		} finally {
			if (this.current === current) this.current = null;
			if (this.recording === recording) this.recording = null;
			if (turn.turnId)
				this.traces.set(turn.turnId, recording.finish(this.opened.model));
			this.passOnUnread();
		}
	}

	/**
	 * A background notice for this chat, Claude Code's way, or something said on a call (`steer`): into the running turn,
	 * read before its next step (pi's steer). False when no turn runs here: the caller makes it a turn of its own.
	 */
	async notify(text: string, kind: NoticeKind = "notice"): Promise<boolean> {
		if (!this.current) return false;
		this.notices.push({ text, kind });
		await this.opened.pi.steer(text);
		return true;
	}

	/** Notices the turn ended without reading leave pi's queue and go as a turn of their own, so none is lost. */
	private passOnUnread() {
		if (!this.notices.length) return;
		const read = (text: string) =>
			this.opened.pi.messages.some(
				(m) =>
					m.role === "user" &&
					JSON.stringify(m.content).includes(JSON.stringify(text).slice(1, -1)),
			);
		const unread = this.notices.filter((n) => !read(n.text));
		this.notices = [];
		if (!unread.length) return;
		this.opened.pi.clearQueue();
		for (const { text, kind } of unread)
			void this.redeliver(text, kind).catch((err: unknown) =>
				console.error("dev-runner: couldn't pass on a background notice:", err),
			);
	}

	/** The trace of a turn that finished (however it ended), once: the settle callback carries it to the API. */
	takeTrace(turnId: string): TurnTrace | undefined {
		const trace = this.traces.get(turnId);
		this.traces.delete(turnId);
		return trace;
	}

	/**
	 * One turn: the input, pi's run, then the session's upkeep (a rollover when it's full) before the turn settles, while
	 * the turn may still use the model. A turn that overflowed the context is run again, once, in the fresh session.
	 */
	private async run(
		text: string,
		turn: TurnContext,
		current: { cancelled: boolean },
	): Promise<TurnResult> {
		for (let attempt = 1; ; attempt++) {
			const input = await this.opened.startTurn(turn, text);
			if (current.cancelled) return CANCELLED;
			this.emit({
				sessionUpdate: "user_message_chunk",
				content: { type: "text", text: input },
				...(turn.turnId ? { _meta: { [TURN_ID_META]: turn.turnId } } : {}),
			});
			this.replied = false;
			await this.opened.pi.prompt(input);
			if (current.cancelled) return CANCELLED;
			if (
				turn.checkReply &&
				!this.replied &&
				!modelError(this.opened.pi.messages) &&
				finalText(this.opened.pi.messages)
			) {
				await this.opened.pi.prompt(REPLY_CHECK);
				if (current.cancelled) return CANCELLED;
			}
			// pi ends a turn whose model call failed normally, with the error on the last message; the server must hear of it.
			const failure = modelError(this.opened.pi.messages);
			const answer = finalText(this.opened.pi.messages);
			const rollover = await this.opened.endTurn({ failed: failure !== null });
			if (current.cancelled) return CANCELLED;
			if (rollover) {
				this.compactions++;
				this.emit({
					sessionUpdate: "compaction_update",
					compactionId: `rollover-${this.compactions}`,
					status: "completed",
					_meta: { [ROLLOVER_META]: rollover },
				});
			}
			if (!failure) return { stopReason: "end_turn", answer };
			if (rollover?.reason !== "overflow" || attempt > 1)
				throw new Error(failure);
		}
	}

	/** Stops the chat's background helpers, for a chat that was deleted. */
	stopJobs() {
		this.opened.stopJobs?.();
	}

	/** Stops the running turn, if any, and waits until it's over. */
	async cancel(): Promise<void> {
		const current = this.current;
		if (!current) return;
		current.cancelled = true;
		this.opened.cancelTurn();
		await this.opened.pi.abort();
		await current.done;
	}

	private emit(update: SessionUpdate) {
		this.remember(update);
		this.recording?.add(update);
		for (const listener of this.listeners) listener(update);
	}

	/** Streamed text arrives a few characters at a time; replay merges consecutive chunks so history stays small. */
	private remember(update: SessionUpdate) {
		const last = this.history.at(-1);
		if (
			last &&
			(update.sessionUpdate === "agent_message_chunk" ||
				update.sessionUpdate === "agent_thought_chunk") &&
			last.sessionUpdate === update.sessionUpdate &&
			last.content.type === "text" &&
			update.content.type === "text" &&
			sameRun(last, update)
		) {
			this.history[this.history.length - 1] = {
				...last,
				content: {
					type: "text",
					text: last.content.text + update.content.text,
				},
			};
			return;
		}
		this.history.push(update);
		if (this.history.length > HISTORY_LIMIT) this.history.shift();
	}
}

/** All sessions on this box, opened lazily on first use (a turn or a `session/load`) and kept for the box's lifetime. */
export class Hub {
	private readonly sessions = new Map<string, Promise<HubSession>>();

	/** `notice`: how a background notice (or an unread call steer) reaches a chat with no turn running (the API makes it a turn). */
	constructor(
		private readonly openSession: (sessionId: string) => Promise<OpenedSession>,
		private readonly secrets: string[] = [],
		private readonly notice: (
			chatId: string,
			text: string,
			kind: NoticeKind,
		) => Promise<void> = async () => {},
	) {}

	/** A background notice for a chat: into its running turn, else (none running, or the session isn't open) as its own turn. */
	async notify(chatId: string, text: string): Promise<void> {
		const session = await this.sessions.get(chatId)?.catch(() => null);
		if (session && (await session.notify(text))) return;
		await this.notice(chatId, text, "notice");
	}

	get(sessionId: string): Promise<HubSession> {
		let session = this.sessions.get(sessionId);
		if (!session) {
			session = this.openSession(sessionId).then(
				(opened) =>
					new HubSession(opened, this.secrets, (text, kind) =>
						this.notice(sessionId, text, kind),
					),
			);
			// A failed open (e.g. a corrupt session file) shouldn't poison the id for the box's lifetime.
			session.catch(() => this.sessions.delete(sessionId));
			this.sessions.set(sessionId, session);
		}
		return session;
	}
}
