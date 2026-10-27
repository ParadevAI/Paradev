import { type Cursor, parseCursor } from "@superset/chat/protocol";
import { type Connection, type ConnectionContext, Server } from "partyserver";
import {
	AgentSessionLog,
	type AppendInput,
	type EventsBefore,
	type EventsSince,
	type SessionHead,
	type SqlCursor,
	type TranscriptRow,
} from "./agent-session/AgentSessionLog";
import type { RealtimeEnv } from "./types";

interface Subscriber {
	deltas: boolean;
}

/**
 * One object per agent session. The worker appends each step; readers catch
 * up from a chat-v3 cursor and then follow live. Access is decided by whoever
 * minted the ticket the route checked; nothing here knows about users.
 */
export class AgentSessionHub extends Server<RealtimeEnv> {
	static options = { hibernate: true };

	private log: AgentSessionLog | null = null;

	constructor(ctx: DurableObjectState, env: RealtimeEnv) {
		super(ctx, env);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	async append(input: AppendInput): Promise<{ duplicate: boolean }> {
		const result = this.sessionLog().append(input);
		const envelopes = result.envelopes.map((envelope) =>
			JSON.stringify(envelope),
		);
		const deltas = result.deltas.map((delta) => JSON.stringify(delta));
		for (const connection of this.getConnections<Subscriber>()) {
			for (const message of envelopes) connection.send(message);
			if (connection.state?.deltas) {
				for (const message of deltas) connection.send(message);
			}
		}
		return { duplicate: result.duplicate };
	}

	async eventsSince(since: string | null, limit: number): Promise<EventsSince> {
		const cursor = parseOptionalCursor(since);
		if (cursor === "invalid") return { reset: "invalid_cursor" };
		return this.sessionLog().eventsSince(cursor, limit);
	}

	async eventsBefore(
		before: string | null,
		limit: number,
	): Promise<EventsBefore> {
		const cursor = parseOptionalCursor(before);
		if (cursor === "invalid") return { reset: "invalid_cursor" };
		return this.sessionLog().eventsBefore(cursor, limit);
	}

	async head(): Promise<SessionHead> {
		return this.sessionLog().head();
	}

	async transcript(query: {
		afterSeq?: number;
		stepKey?: string;
	}): Promise<TranscriptRow[]> {
		return this.sessionLog().transcript(query);
	}

	async onConnect(
		connection: Connection<Subscriber>,
		ctx: ConnectionContext,
	): Promise<void> {
		const url = new URL(ctx.request.url);
		const deltas = (url.searchParams.get("deltas") ?? "")
			.split(",")
			.includes("text");
		const cursor = parseOptionalCursor(url.searchParams.get("since"));
		if (cursor === "invalid") {
			this.sendReset(connection, "invalid_cursor");
			return;
		}
		connection.setState({ deltas });

		let since: Cursor | null = cursor;
		for (;;) {
			const page = this.sessionLog().eventsSince(since);
			if ("reset" in page) {
				this.sendReset(connection, page.reset);
				return;
			}
			for (const envelope of page.envelopes)
				connection.send(JSON.stringify(envelope));
			since = page.envelopes.at(-1)?.cursor ?? since;
			if (!page.more) return;
		}
	}

	private sendReset(connection: Connection<Subscriber>, reason: string): void {
		connection.send(
			JSON.stringify({
				v: 1,
				sessionId: this.name,
				ts: Date.now(),
				reset: { reason },
			}),
		);
		connection.close(1000, reason);
	}

	private sessionLog(): AgentSessionLog {
		const sql = this.ctx.storage.sql;
		this.log ??= new AgentSessionLog(
			{
				exec: <T>(query: string, ...bindings: unknown[]) =>
					sql.exec(
						query,
						...(bindings as SqlStorageValue[]),
					) as unknown as SqlCursor<T>,
			},
			(fn) => this.ctx.storage.transactionSync(fn),
			this.name,
		);
		return this.log;
	}
}

function parseOptionalCursor(value: string | null): Cursor | null | "invalid" {
	if (!value) return null;
	try {
		return parseCursor(value);
	} catch {
		return "invalid";
	}
}
