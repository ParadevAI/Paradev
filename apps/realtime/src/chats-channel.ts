import { DurableObject } from "cloudflare:workers";
import { CHATS_REALTIME_PROTOCOL } from "@superset/shared/chats-realtime";
import {
	append,
	ephemeral,
	type Frame,
	migrate,
	resume,
	type Sql,
} from "./chats/channel-log";
import type { RealtimeEnv } from "./types";

/** Closes a socket whose ticket ran out; the client fetches a new one, with its current channels, and reconnects. */
const TICKET_EXPIRED = 4001;

/** What each hibernated socket remembers: its ticket's expiry, in seconds. */
interface Attachment {
	exp: number;
}

/**
 * One chat channel (`user:<id>` or `group:<id>`): the sockets listening to
 * it, hibernated between events, and its recent history for clients resuming
 * by seq. The Worker has already checked the ticket, so this only accepts,
 * replays and broadcasts.
 */
export class ChatsChannel extends DurableObject<RealtimeEnv> {
	private readonly sql: Sql;

	constructor(ctx: DurableObjectState, env: RealtimeEnv) {
		super(ctx, env);
		this.sql = {
			exec: (query, ...params) =>
				ctx.storage.sql.exec(query, ...params).toArray(),
		};
		migrate(this.sql);
		ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair("ping", "pong"),
		);
	}

	/** A websocket upgrade the Worker forwarded with the channel, the ticket's expiry and the client's last seq. */
	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);
		const channel = url.searchParams.get("channel") ?? "";
		const since = url.searchParams.get("since");
		const { 0: client, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({
			exp: Number(url.searchParams.get("exp")),
		} satisfies Attachment);
		const frames = resume(
			this.sql,
			channel,
			since === null ? null : Number(since),
			Date.now(),
		);
		for (const frame of frames) server.send(JSON.stringify(frame));
		return new Response(null, {
			status: 101,
			webSocket: client,
			headers: { "sec-websocket-protocol": CHATS_REALTIME_PROTOCOL },
		});
	}

	/** Called by the Worker for each publish; returns the event's seq. A `transient` one is only broadcast. */
	publish(channel: string, data: string, transient = false): number {
		const frame = transient
			? ephemeral(this.sql, channel, data)
			: append(this.sql, channel, data, Date.now());
		this.broadcast(frame);
		return frame.seq;
	}

	private broadcast(frame: Frame) {
		const text = JSON.stringify(frame);
		const now = Date.now() / 1000;
		for (const socket of this.ctx.getWebSockets()) {
			const { exp } = socket.deserializeAttachment() as Attachment;
			if (exp <= now) socket.close(TICKET_EXPIRED, "ticket expired");
			else socket.send(text);
		}
	}

	webSocketClose(socket: WebSocket, code: number) {
		// A close without a code (1005) is answered with a normal one; 1006 means the connection is already gone.
		if (code !== 1006) socket.close(code === 1005 ? 1000 : code, "closing");
	}
}
