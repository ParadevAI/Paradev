import type { Delta, DurableEvent, Turn } from "@superset/chat/protocol";
import { SessionStream } from "@superset/chat-runtime/acp-stream";

export type AcpUpdate = { sessionUpdate: string } & Record<string, unknown>;

export interface MappedOutput {
	events: DurableEvent[];
	deltas: Delta[];
}

export interface AcpEventMapperOptions {
	harness: string;
	now?: () => number;
	mintId?: () => string;
}

/**
 * Turns a session's ACP updates into chat-v3 events with chat-runtime's own
 * mapping. It keeps the open turn's tool calls and messages in memory, so it
 * must see every update of a turn in order; replay the stored ACP rows of the
 * open turn to rebuild it.
 */
export class AcpEventMapper {
	private readonly now: () => number;
	private readonly stream: SessionStream;
	private pending: MappedOutput = { events: [], deltas: [] };
	private clientId: string | undefined;
	private lastStartMs = 0;

	constructor(private readonly options: AcpEventMapperOptions) {
		this.now = options.now ?? Date.now;
		const mintId = options.mintId ?? (() => crypto.randomUUID());
		this.stream = new SessionStream({
			idPrefix: "",
			scopeIdsByTurn: true,
			streamUserMessages: true,
			emitItem: (item, turnId) =>
				this.pending.events.push({
					type: "item",
					item:
						item.kind === "user_message" && this.clientId
							? { ...item, clientId: this.clientId }
							: item,
					turnId,
				}),
			emitTextDelta: (itemId, append) =>
				this.pending.deltas.push({ type: "text", itemId, append }),
			attachmentOf: () => null,
			reportedModel: (raw) => {
				const model = (raw as { _meta?: { piAcp?: { model?: unknown } } })._meta
					?.piAcp?.model;
				return typeof model === "string" ? model : undefined;
			},
			nextStartMs: () => {
				this.lastStartMs = Math.max(this.now(), this.lastStartMs + 1);
				return this.lastStartMs;
			},
			now: this.now,
			mintId,
		});
	}

	startTurn(turnId: string, startedAtMs: number): MappedOutput {
		const turn: Turn = { id: turnId, status: "running", startedAtMs };
		return {
			events: [
				{ type: "turn", turn },
				{
					type: "session",
					session: this.sessionState("running"),
				},
			],
			deltas: [],
		};
	}

	apply(update: AcpUpdate, turnId: string): MappedOutput {
		if (update.sessionUpdate !== "state_update") {
			this.clientId =
				typeof update.clientId === "string" ? update.clientId : undefined;
			this.stream.handleUpdate(update.sessionUpdate, update, turnId);
			this.clientId = undefined;
		}
		return this.take();
	}

	endTurn(turn: Turn): MappedOutput {
		this.stream.flush();
		const out = this.take();
		out.events.push(
			{ type: "turn", turn },
			{
				type: "session",
				session: this.sessionState("idle"),
			},
		);
		return out;
	}

	/** The host's prompt queue does not exist here: a message sent mid-turn joins the turn. */
	private sessionState(status: "running" | "idle") {
		return { status, harness: this.options.harness, queueControls: false };
	}

	private take(): MappedOutput {
		const out = this.pending;
		this.pending = { events: [], deltas: [] };
		return out;
	}
}
