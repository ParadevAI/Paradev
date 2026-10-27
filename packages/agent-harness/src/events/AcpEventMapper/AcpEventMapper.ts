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
	private lastStartMs = 0;

	constructor(private readonly options: AcpEventMapperOptions) {
		this.now = options.now ?? Date.now;
		const mintId = options.mintId ?? (() => crypto.randomUUID());
		this.stream = new SessionStream({
			idPrefix: "",
			scopeIdsByTurn: true,
			streamUserMessages: true,
			emitItem: (item, turnId) =>
				this.pending.events.push({ type: "item", item, turnId }),
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
					session: { status: "running", harness: this.options.harness },
				},
			],
			deltas: [],
		};
	}

	apply(update: AcpUpdate, turnId: string): MappedOutput {
		if (update.sessionUpdate !== "state_update") {
			this.stream.handleUpdate(update.sessionUpdate, update, turnId);
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
				session: { status: "idle", harness: this.options.harness },
			},
		);
		return out;
	}

	private take(): MappedOutput {
		const out = this.pending;
		this.pending = { events: [], deltas: [] };
		return out;
	}
}
