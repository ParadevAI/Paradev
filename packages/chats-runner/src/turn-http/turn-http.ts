import type { IncomingMessage, ServerResponse } from "node:http";
import type { Grant } from "../auth/auth.ts";
import type { Hub, NoticeKind, TurnContext } from "../hub/hub.ts";
import { chatIdOf } from "../session-key/session-key.ts";
import type { ChatContext } from "../turn-input/turn-input.ts";
import type { TurnTrace } from "../turn-trace/turn-trace.ts";

/** How a turn settled, as the runner reports it to the Dev API, with what it did. */
export type Settlement = (
	| { stopReason: string; answer: string }
	| { stopReason: "end_turn"; error: string }
) & { trace?: TurnTrace };

/** Reports a settled turn to the API, naming the turn's chat (the box's proxy adds its credential). */
export type Settle = (
	turnId: string,
	chatId: string,
	settlement: Settlement,
) => Promise<void>;

export interface TurnHttpOptions {
	hub: Hub;
	verify: (token: string) => Promise<Grant>;
	settle: Settle;
	/** Whether the box has background work, which the API keeps it up for (`GET /status`). */
	busy?: () => boolean;
	/** A turn was taken: the API has registered this box, so its credential works from now on. */
	onTurn?: () => void;
}

/** `GET /status` for the API, with a control token for this box: whether background work keeps it busy. */
export function statusRequest(opts: Pick<TurnHttpOptions, "verify" | "busy">) {
	return async (req: IncomingMessage, res: ServerResponse) => {
		if (req.method !== "GET") return reply(res, 405);
		const header = req.headers.authorization ?? "";
		let grant: Grant;
		try {
			grant = await opts.verify(
				header.startsWith("Bearer ") ? header.slice(7) : "",
			);
		} catch {
			return reply(res, 401, { error: "unauthorized" });
		}
		if (grant.scope !== "control")
			return reply(res, 403, { error: "watch tokens can't ask" });
		return reply(res, 200, { busy: opts.busy?.() ?? false });
	};
}

/** A turn carries the chat's recent messages and roster and its connected apps; this is plenty. */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const reply = (res: ServerResponse, status: number, body?: unknown) => {
	res
		.writeHead(
			status,
			body === undefined ? {} : { "content-type": "application/json" },
		)
		.end(body === undefined ? undefined : JSON.stringify(body));
};

async function readJson(
	req: IncomingMessage,
): Promise<Record<string, unknown> | null> {
	const chunks: Buffer[] = [];
	let size = 0;
	for await (const chunk of req as AsyncIterable<Buffer>) {
		size += chunk.length;
		if (size > MAX_BODY_BYTES) return null;
		chunks.push(chunk);
	}
	try {
		const body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
		return body && typeof body === "object"
			? (body as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** The turn context in a `POST /turns` body; null when it isn't one. */
function readTurnContext(value: unknown): TurnContext | null {
	const turn = value as Partial<TurnContext> | null | undefined;
	if (!turn || typeof turn !== "object") return null;
	return {
		env: turn.env ?? {},
		...(typeof turn.turnId === "string" ? { turnId: turn.turnId } : {}),
		...(Array.isArray(turn.plugins) ? { plugins: turn.plugins } : {}),
		...(turn.ownerOneToOne === true ? { ownerOneToOne: true } : {}),
		...(turn.devAsk === true ? { devAsk: true } : {}),
		...(isChatContext(turn.chat) ? { chat: turn.chat } : {}),
		...(typeof turn.chatId === "string" ? { chatId: turn.chatId } : {}),
		...(turn.canBackground === true ? { canBackground: true } : {}),
		...(turn.checkReply === true ? { checkReply: true } : {}),
	};
}

function isChatContext(value: unknown): value is ChatContext {
	const chat = value as Partial<ChatContext> | null | undefined;
	return (
		!!chat &&
		typeof chat.roster === "string" &&
		Array.isArray(chat.recent) &&
		chat.recent.every(
			(r) => typeof r?.line === "string" && typeof r.seen === "boolean",
		)
	);
}

/**
 * The Dev API's control endpoints, next to ACP on the same port: `POST /turns` starts a turn and answers 202 at
 * once, then the runner calls the API back when it settles; `POST /turns/cancel` stops the session's running turn (and,
 * with `jobs`, its background helpers); `POST /turns/steer` tells the running turn something more (pi's steer, read before
 * its next step: what the person said on a call while it worked), answering `{ steered: false }` when no turn runs. All
 * take a control token (`Authorization: Bearer`) for this box and this session. Watchers use ACP.
 */
export function turnRequests(opts: TurnHttpOptions) {
	// The API's workflow may retry its start step after a crash; a turn this box already took isn't run a second time
	// (it would cancel itself and re-post its reply). Ids are random, and a box lives for one idle period.
	const started = new Set<string>();

	return async (
		req: IncomingMessage,
		res: ServerResponse,
		path: "/turns" | "/turns/cancel" | "/turns/steer",
	) => {
		if (req.method !== "POST") return reply(res, 405);
		const header = req.headers.authorization ?? "";
		let grant: Grant;
		try {
			grant = await opts.verify(
				header.startsWith("Bearer ") ? header.slice(7) : "",
			);
		} catch {
			return reply(res, 401, { error: "unauthorized" });
		}
		if (grant.scope !== "control")
			return reply(res, 403, { error: "watch tokens can't run turns" });
		const body = await readJson(req);
		if (!body) return reply(res, 400, { error: "expected a JSON body" });
		if (body.sessionId !== grant.sessionId)
			return reply(res, 403, { error: "this token is for another session" });
		const session = await opts.hub.get(grant.sessionId);

		if (path === "/turns/steer") {
			if (typeof body.text !== "string" || !body.text.trim())
				return reply(res, 400, { error: "expected {sessionId, text}" });
			// Like a background notice: one the turn ends without reading goes back to the API as a turn of its own.
			return reply(res, 200, {
				steered: await session.notify(body.text, "steer"),
			});
		}

		if (path === "/turns/cancel") {
			// A deleted chat stops its background helpers too; a newer message only cancels the turn.
			if (body.jobs === true) session.stopJobs();
			await session.cancel();
			return reply(res, 204);
		}

		const turn = readTurnContext(body.meta);
		if (!turn?.turnId || typeof body.text !== "string")
			return reply(res, 400, {
				error: "expected {sessionId, text, meta: {turnId, …}}",
			});
		const { turnId } = turn;
		const chatId = chatIdOf(grant.sessionId);
		if (turn.chatId !== undefined && turn.chatId !== chatId)
			return reply(res, 400, {
				error: "meta.chatId isn't this session's chat",
			});
		if (started.has(turnId)) return reply(res, 202);
		started.add(turnId);
		opts.onTurn?.();
		const withTrace = (settlement: Settlement): Settlement => {
			const trace = session.takeTrace(turnId);
			return trace ? { ...settlement, trace } : settlement;
		};
		void session.prompt(body.text, turn).then(
			(result) => opts.settle(turnId, chatId, withTrace(result)),
			(err: unknown) =>
				opts.settle(
					turnId,
					chatId,
					withTrace({
						stopReason: "end_turn",
						error: err instanceof Error ? err.message : String(err),
					}),
				),
		);
		reply(res, 202);
	};
}

/** How often, and how patiently, a settle callback is retried while the API is unreachable (a restart, say). */
const SETTLE_ATTEMPTS = 6;
const SETTLE_FIRST_DELAY_MS = 500;

/**
 * `POST <api>/cli/turns/:id/settled`, retried with backoff on network errors and 5xx. A 4xx (not this box's turn, the
 * box was stopped) isn't retried; if every attempt fails the API's turn times out on its own.
 */
export function settleOverHttp(
	apiUrl: string,
	sleep: (ms: number) => Promise<void> = (ms) =>
		new Promise((r) => setTimeout(r, ms)),
): Settle {
	const base = apiUrl.replace(/\/+$/, "");
	return async (turnId, chatId, settlement) => {
		for (let attempt = 1; ; attempt++) {
			const status = await fetch(`${base}/cli/turns/${turnId}/settled`, {
				method: "POST",
				headers: { "x-dev-chat": chatId, "content-type": "application/json" },
				body: JSON.stringify(settlement),
			}).then(
				(res) => res.status,
				() => 0,
			);
			if (status > 0 && status < 500) {
				if (status >= 400)
					console.error(
						`dev-runner: the API refused turn ${turnId}'s settlement (${status})`,
					);
				return;
			}
			if (attempt === SETTLE_ATTEMPTS) {
				console.error(
					`dev-runner: couldn't report turn ${turnId} settled (${status || "unreachable"})`,
				);
				return;
			}
			await sleep(SETTLE_FIRST_DELAY_MS * 2 ** (attempt - 1));
		}
	};
}

/**
 * `POST <api>/cli/notifications`, naming the chat: a notice of background work that ended while no turn ran there,
 * which the API turns into a `## Background notice` turn, or (`kind: "steer"`) something said on a call the turn ended
 * without reading, which it turns into a turn answering it. Retried like a settlement, since a lost one would leave
 * the Dev's "I'm on it" without a follow-up.
 */
export function noticesOverHttp(
	apiUrl: string,
	sleep: (ms: number) => Promise<void> = (ms) =>
		new Promise((r) => setTimeout(r, ms)),
) {
	const url = `${apiUrl.replace(/\/+$/, "")}/cli/notifications`;
	return async (chatId: string, text: string, kind: NoticeKind = "notice") => {
		for (let attempt = 1; ; attempt++) {
			const status = await fetch(url, {
				method: "POST",
				headers: { "x-dev-chat": chatId, "content-type": "application/json" },
				body: JSON.stringify({ text, kind }),
			}).then(
				(res) => res.status,
				() => 0,
			);
			if (status > 0 && status < 500) {
				if (status >= 400)
					console.error(
						`dev-runner: the API refused a background notice in ${chatId} (${status})`,
					);
				return;
			}
			if (attempt === SETTLE_ATTEMPTS) {
				console.error(
					`dev-runner: couldn't hand in a background notice in ${chatId} (${status || "unreachable"})`,
				);
				return;
			}
			await sleep(SETTLE_FIRST_DELAY_MS * 2 ** (attempt - 1));
		}
	};
}
