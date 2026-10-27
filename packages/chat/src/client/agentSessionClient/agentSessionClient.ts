import type { ChatRouterOutputs } from "@superset/chat-runtime";
import type { Cursor } from "../../protocol/cursor";
import { serializeCursor } from "../../protocol/cursor";
import type { DurableEnvelope, SessionState } from "../../protocol/envelope";
import type { SessionClient } from "../sessionClient";
import type { StreamSocket, Wait } from "../subscribeToSession";
import { buildStreamUrl, subscribeToSession } from "../subscribeToSession";

/** A read ticket for one session's store, from the API's `agent.sessionStream`. */
export type AgentSessionAccess = {
	baseUrl: string;
	ticket: string;
	expiresInSeconds: number;
};

/** The API calls an agent session needs; the app wires them to its tRPC client. */
export type AgentSessionApi = {
	access(sessionId: string): Promise<AgentSessionAccess>;
	prompt(input: {
		sessionId: string;
		promptId: string;
		text: string;
	}): Promise<unknown>;
	interrupt(sessionId: string): Promise<unknown>;
};

export type AgentSessionClientOptions = {
	sessionId: string;
	api: AgentSessionApi;
	/** Shown as the chat's title; agent sessions have no title of their own. */
	title?: string;
	fetch?: typeof fetch;
	createWebSocket?: (url: string) => WebSocket;
	now?: () => number;
	wait?: Wait;
	backoffInitialMs?: number;
	backoffMaxMs?: number;
};

const HARNESS = "agent-harness";
const PAGE_LIMIT = 200;
const TICKET_MARGIN_MS = 60_000;

type HeadResponse = {
	cursor: Cursor | null;
	session: SessionState | null;
	updatedAt: number | null;
};

type PageResponse =
	| { reset: string }
	| { envelopes: DurableEnvelope[]; nextBefore: Cursor | null };

/**
 * A chat-v3 session client for an agent session: history and the live stream
 * come from the session store in apps/realtime, messages and stops go to the
 * agent API. What agent sessions do not have (a prompt queue, modes,
 * approvals, subagents) does nothing.
 */
export function createAgentSessionClient(
	options: AgentSessionClientOptions,
): SessionClient {
	const { sessionId, api } = options;
	const fetcher = options.fetch ?? fetch;
	const now = options.now ?? Date.now;
	const createWebSocket =
		options.createWebSocket ?? ((url: string) => new WebSocket(url));
	const streams = new Set<{ close(): void }>();
	let cached: { expiresAt: number; value: Promise<AgentSessionAccess> } | null =
		null;

	/** Every request and every redial reads a ticket that is good for at least another minute. */
	const access = (): Promise<AgentSessionAccess> => {
		if (cached && now() < cached.expiresAt) return cached.value;
		const value = api.access(sessionId);
		const entry = { expiresAt: Number.POSITIVE_INFINITY, value };
		cached = entry;
		value.then(
			(granted) => {
				entry.expiresAt =
					now() + granted.expiresInSeconds * 1000 - TICKET_MARGIN_MS;
			},
			() => {
				if (cached === entry) cached = null;
			},
		);
		return value;
	};

	const read = async <T>(path: string): Promise<T> => {
		const { baseUrl, ticket } = await access();
		const response = await fetcher(
			`${baseUrl}/sessions/${encodeURIComponent(sessionId)}/${path}`,
			{ headers: { authorization: `Bearer ${ticket}` } },
		);
		if (!response.ok) {
			throw new Error(`Agent session ${path} failed: ${response.status}`);
		}
		return (await response.json()) as T;
	};

	const deferredSocket = (path: string): StreamSocket => {
		let inner: WebSocket | null = null;
		let closed = false;
		const socket: StreamSocket = {
			onopen: null,
			onmessage: null,
			onclose: null,
			onerror: null,
			close() {
				closed = true;
				inner?.close();
			},
		};
		const emit = (handler: StreamSocket["onopen"], event?: { data: unknown }) =>
			(handler as ((event?: { data: unknown }) => void) | null)?.(event);
		access().then(
			({ baseUrl, ticket }) => {
				if (closed) return;
				const url = `${baseUrl.replace(/^http/, "ws")}${path}${path.includes("?") ? "&" : "?"}ticket=${encodeURIComponent(ticket)}`;
				const ws = createWebSocket(url);
				inner = ws;
				ws.onopen = () => emit(socket.onopen);
				ws.onmessage = (event) => emit(socket.onmessage, { data: event.data });
				ws.onerror = () => emit(socket.onerror);
				ws.onclose = () => emit(socket.onclose);
			},
			() => {
				if (!closed) emit(socket.onclose);
			},
		);
		return socket;
	};

	return {
		sessionId,

		async getSession(): Promise<ChatRouterOutputs["getSession"]> {
			const head = await read<HeadResponse>("head");
			return {
				session: {
					sessionId,
					scopeId: "",
					harness: HARNESS,
					harnessSessionId: null,
					epoch: head.cursor?.epoch ?? "",
					status: head.session?.status ?? "idle",
					title: options.title ?? null,
					queuedCount: 0,
					updatedAt: head.updatedAt ?? now(),
				},
				cursor: head.cursor,
				live: true,
			};
		},

		async getItems(page = {}): Promise<ChatRouterOutputs["getItems"]> {
			const params = new URLSearchParams({
				before: page.before ? serializeCursor(page.before) : "",
				limit: String(page.limit ?? PAGE_LIMIT),
			});
			const result = await read<PageResponse>(`events?${params}`);
			if ("reset" in result) {
				return { ok: false, reset: result.reset as never };
			}
			return {
				ok: true,
				envelopes: result.envelopes,
				nextBefore: result.nextBefore,
			};
		},

		async getOutline(): Promise<ChatRouterOutputs["getOutline"]> {
			throw new Error("Agent sessions have no outline; load items instead.");
		},

		async getItemBodies(): Promise<ChatRouterOutputs["getItemBodies"]> {
			return { ok: true, items: [] };
		},

		async prompt(prompt): Promise<ChatRouterOutputs["prompt"]> {
			if (prompt.content.some((part) => part.type !== "text")) {
				throw new Error("Agent sessions take text only for now.");
			}
			const text = prompt.content
				.map((part) => (part.type === "text" ? part.text : ""))
				.join("\n");
			await api.prompt({ sessionId, promptId: prompt.clientId, text });
			return { itemId: `user-${prompt.clientId}`, queued: false };
		},

		async cancelTurn() {
			await api.interrupt(sessionId);
		},

		async removeQueuedPrompt() {},
		async steerQueuedPrompt() {},
		async updateQueuedPrompt() {},
		async resumeQueue() {},
		async stopBackgroundTask() {
			return false;
		},
		async steerSubagent() {
			return "unsupported" as const;
		},
		async backgroundSubagent() {
			return "unsupported" as const;
		},
		async respondToApproval() {},
		async setMode() {},
		async setConfigOption() {},

		subscribe(subscribeOptions) {
			const deltas = subscribeOptions.deltas ?? [];
			const stream = subscribeToSession({
				createSocket: (url) => deferredSocket(url),
				url: (since) =>
					buildStreamUrl({ baseUrl: "", sessionId, deltas, since }),
				since: subscribeOptions.since,
				onEnvelope: subscribeOptions.onEnvelope,
				onReset: subscribeOptions.onReset,
				onStatusChange: subscribeOptions.onStatusChange,
				wait: options.wait,
				backoffInitialMs: options.backoffInitialMs,
				backoffMaxMs: options.backoffMaxMs,
			});
			streams.add(stream);
			return {
				cursor: () => stream.cursor(),
				close: () => {
					streams.delete(stream);
					stream.close();
				},
			};
		},

		close() {
			for (const stream of [...streams]) stream.close();
		},
	};
}
