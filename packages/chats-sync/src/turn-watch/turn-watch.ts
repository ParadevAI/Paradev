import type { SessionUpdate } from "@agentclientprotocol/sdk";
import type { WatchTicket } from "../api-types/api-types.ts";

/** The browser's or React Native's WebSocket: both take subprotocols and dispatch open, message and close events. */
interface Socket {
	readyState: number;
	send(data: string): void;
	close(): void;
	addEventListener(
		type: "open" | "message" | "close" | "error",
		listener: (event: { data?: unknown }) => void,
	): void;
}
export type SocketConstructor = new (
	url: string,
	protocols: string[],
) => Socket;

interface WatchOptions {
	/** A fresh watch token for every connection: tokens live two minutes and a box gets a new id when it wakes. */
	ticket: () => Promise<WatchTicket>;
	onUpdate: (update: SessionUpdate) => void;
	/** The stream is gone for good (no ticket, or it dropped again after the one reconnect). */
	onLost: (err: unknown) => void;
	/** Tests pass a fake; the apps use the platform's. */
	WebSocket?: SocketConstructor;
}

/** ACP's protocol version (the SDK's PROTOCOL_VERSION), as `initialize` asks for it. */
export const ACP_PROTOCOL_VERSION = 1;

/** One reconnect covers a blip (sleep, network change); a box that keeps dropping is gone, so stop trying. */
const RECONNECTS = 1;

/**
 * Streams one group's session from a Dev's box, read-only: connect over a websocket with the watch token as the
 * subprotocol (`acp, <jwt>`; browsers can't set headers), `initialize`, `session/load` (the box replays recent history,
 * then streams live), and hand every `session/update` to `onUpdate`. Plain JSON-RPC, one message per frame as the box
 * sends them, so it runs where web streams don't (React Native). Returns a function that stops watching.
 */
export function watchSession({
	ticket,
	onUpdate,
	onLost,
	WebSocket,
}: WatchOptions): () => void {
	const Socket =
		WebSocket ??
		(globalThis as unknown as { WebSocket: SocketConstructor }).WebSocket;
	let stopped = false;
	let reconnects = RECONNECTS;
	let current: Socket | null = null;

	function attempt() {
		let failed = false;
		const fail = (err: unknown) => {
			if (failed) return;
			failed = true;
			current?.close();
			if (stopped) return;
			if (reconnects-- > 0) return attempt();
			stopped = true;
			onLost(err);
		};
		open(fail).catch(fail);
	}

	async function open(fail: (err: unknown) => void) {
		const { acpUrl, token, sessionId } = await ticket();
		if (stopped) throw new Error("stopped");
		// Only box endpoints: the token must never go anywhere else.
		if (!/^wss?:\/\//.test(acpUrl)) throw new Error(`not a box URL: ${acpUrl}`);
		const socket = new Socket(acpUrl, ["acp", token]);
		current = socket;
		let nextId = 0;
		const pending = new Map<
			number,
			(message: { error?: { message?: string } }) => void
		>();
		const request = (method: string, params: unknown) =>
			new Promise<void>((resolve, reject) => {
				const id = ++nextId;
				pending.set(id, (reply) =>
					reply.error
						? reject(new Error(reply.error.message ?? `${method} failed`))
						: resolve(),
				);
				socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
			});
		socket.addEventListener("message", (event) => {
			let message: {
				id?: number;
				method?: string;
				params?: { update?: SessionUpdate };
				error?: { message?: string };
			};
			try {
				message = JSON.parse(String(event.data));
			} catch {
				return fail(new Error("the box sent something that isn't JSON"));
			}
			if (message.method === "session/update" && message.params?.update) {
				if (!stopped) onUpdate(message.params.update);
			} else if (message.id !== undefined && pending.has(message.id)) {
				pending.get(message.id)!(message);
				pending.delete(message.id);
			}
		});
		socket.addEventListener("close", () =>
			fail(new Error("the box closed the stream")),
		);
		socket.addEventListener("error", () =>
			fail(new Error("the stream to the box failed")),
		);
		await new Promise<void>((resolve) =>
			socket.addEventListener("open", () => resolve()),
		);
		await request("initialize", {
			protocolVersion: ACP_PROTOCOL_VERSION,
			clientCapabilities: {},
		});
		await request("session/load", { sessionId, cwd: "/agent", mcpServers: [] });
	}

	attempt();
	return () => {
		stopped = true;
		current?.close();
	};
}

/** A running turn, as `LiveTurns.active` holds it. */
interface WatchedTurn {
	turnId: string | null;
	devId: string;
	groupId: string;
}

/**
 * Which turns to stream, for both apps: every running turn of the chat on screen, nested `dev ask` turns included.
 * `update` starts the turns that came on screen and stops the ones that left or ended; a turn the box won't serve
 * (no permission, dropped twice) isn't tried again, and shows without its stream.
 */
export function createTurnWatches(opts: {
	ticket: (devId: string, groupId: string) => Promise<WatchTicket>;
	onUpdate: (turnId: string, update: SessionUpdate) => void;
	WebSocket?: SocketConstructor;
}) {
	const watches = new Map<string, () => void>();
	const givenUp = new Set<string>();
	return {
		update(active: WatchedTurn[], viewedChatId: string | null) {
			const wanted = new Map(
				active.flatMap((t) =>
					t.groupId === viewedChatId && t.turnId
						? [[t.turnId, t] as const]
						: [],
				),
			);
			for (const [turnId, stop] of watches) {
				if (wanted.has(turnId)) continue;
				stop();
				watches.delete(turnId);
			}
			for (const [turnId, turn] of wanted) {
				if (watches.has(turnId) || givenUp.has(turnId)) continue;
				const stop = watchSession({
					ticket: () => opts.ticket(turn.devId, turn.groupId),
					onUpdate: (update) => opts.onUpdate(turnId, update),
					onLost: () => {
						givenUp.add(turnId);
						watches.delete(turnId);
					},
					WebSocket: opts.WebSocket,
				});
				watches.set(turnId, stop);
			}
		},
		stop() {
			for (const stop of watches.values()) stop();
			watches.clear();
		},
	};
}
