import { db } from "@superset/db/client";
import { chatsAgents, chatsModelUsage, chatsTurns } from "@superset/db/schema";
import { waitUntil } from "@vercel/functions";
import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { type BoxClaims, BoxRequestError, boxAgent, boxTurn } from "./box-auth";
import type { BoxKeys } from "./box-tokens";
import {
	chatFileContent,
	chatFiles,
	DEV_FILE_MAX_BYTES,
	shareDevFile,
} from "./dev-files";
import {
	AskError,
	askDev,
	chatForDev,
	enqueueNoticeTurn,
	postDevMessage,
	settleTurn,
	type TurnDeps,
} from "./engine";
import {
	askQuestion,
	askSchema,
	cancelQuestion,
	MAX_WAIT_S,
	QuestionError,
	releaseQuestion,
	waitForAnswer,
} from "./questions";

const GATEWAY_URL = "https://ai-gateway.vercel.sh";
/** Request headers the Anthropic Messages API understands. Credentials are replaced, not forwarded. */
const FORWARDED_HEADERS = [
	"content-type",
	"accept",
	"anthropic-version",
	"anthropic-beta",
];
const TEXT_MAX = 100_000;

export interface BoxApiDeps {
	keys: BoxKeys;
	turns: TurnDeps;
	/** The AI Gateway key. Without it the model route answers 503. */
	gatewayKey?: string;
	fetch?: typeof fetch;
	/** The most model tokens one person's Devs spend in a UTC day; `DAILY_TOKEN_LIMIT` unless a test lowers it. */
	dailyTokenLimit?: number;
	now?: () => Date;
}

/** Input and output together. A long working day of one person's Devs stays well under it. */
export const DAILY_TOKEN_LIMIT = 20_000_000;

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});

const settlement = z.object({
	stopReason: z.string().max(100),
	answer: z.string().max(1_000_000).optional(),
	error: z.string().max(10_000).optional(),
	trace: z
		.object({
			model: z.string().max(200).nullable(),
			updates: z.array(z.record(z.string(), z.unknown())).max(5_000),
			truncated: z.boolean().optional(),
		})
		.optional(),
});

const devText = z.object({
	text: z
		.string()
		.max(TEXT_MAX)
		.transform((text) => text.replace(/[​-‍⁠﻿]/g, "").trim())
		.pipe(z.string().min(1, "The message has nothing visible in it")),
});

type ReportedUsage = Partial<
	Record<
		| "input_tokens"
		| "output_tokens"
		| "cache_read_input_tokens"
		| "cache_creation_input_tokens",
		number
	>
>;

function toUsage(reported: ReportedUsage = {}) {
	const cacheRead = reported.cache_read_input_tokens ?? 0;
	const cacheWrite = reported.cache_creation_input_tokens ?? 0;
	return {
		inputTokens: (reported.input_tokens ?? 0) + cacheRead + cacheWrite,
		outputTokens: reported.output_tokens ?? 0,
		cacheReadTokens: cacheRead,
		cacheWriteTokens: cacheWrite,
	};
}

function parsed(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

/** Usage from an Anthropic event stream. Each event's counts are cumulative, so the latest of each number wins. */
export async function usageFromStream(body: ReadableStream<Uint8Array>) {
	const latest: Record<string, number> = {};
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		const lines = buffer.split("\n");
		buffer = lines.pop() ?? "";
		for (const line of lines) {
			if (!line.startsWith("data:")) continue;
			const event = parsed(line.slice(5)) as {
				type?: string;
				message?: { usage?: Record<string, unknown> };
				usage?: Record<string, unknown>;
			} | null;
			const reported =
				event?.type === "message_start"
					? event.message?.usage
					: event?.type === "message_delta"
						? event.usage
						: undefined;
			for (const [key, value] of Object.entries(reported ?? {})) {
				if (typeof value === "number") latest[key] = value;
			}
		}
	}
	return toUsage(latest);
}

/** A personal or custom Dev's owner is charged; a group's Dev charges whoever started the turn. */
async function payer(claims: BoxClaims) {
	const [agent] = await db
		.select({
			ownerUserId: chatsAgents.ownerUserId,
			organizationId: chatsAgents.organizationId,
		})
		.from(chatsAgents)
		.where(eq(chatsAgents.id, claims.agentId));
	return agent
		? {
				organizationId: agent.organizationId,
				userId: agent.ownerUserId ?? claims.userId,
			}
		: null;
}

async function recordUsage(
	claims: BoxClaims,
	model: string,
	usage: ReturnType<typeof toUsage>,
) {
	const charged = await payer(claims);
	if (!charged) return;
	await db.insert(chatsModelUsage).values({
		...charged,
		agentId: claims.agentId,
		model,
		...usage,
	});
}

/** Whether the person charged for this turn has spent the day's tokens. */
async function overDailyLimit(deps: BoxApiDeps, claims: BoxClaims) {
	const charged = await payer(claims);
	if (!charged?.userId) return false;
	const dayStart = new Date(deps.now?.() ?? new Date());
	dayStart.setUTCHours(0, 0, 0, 0);
	const [spent] = await db
		.select({
			tokens: sql<string>`coalesce(sum(${chatsModelUsage.inputTokens} + ${chatsModelUsage.outputTokens}), 0)`,
		})
		.from(chatsModelUsage)
		.where(
			and(
				eq(chatsModelUsage.userId, charged.userId),
				gte(chatsModelUsage.createdAt, dayStart),
			),
		);
	return (
		Number(spent?.tokens ?? 0) >= (deps.dailyTokenLimit ?? DAILY_TOKEN_LIMIT)
	);
}

const metered = (work: Promise<unknown>) =>
	waitUntil(
		work.catch((error: unknown) =>
			console.error("[chats] model usage was not recorded:", error),
		),
	);

/**
 * The only way a box reaches a model: authenticated as the Dev's running
 * turn, forwarded with the server's key, streamed back as it is, and metered.
 */
async function model(deps: BoxApiDeps, request: Request, path: string) {
	let claims: BoxClaims;
	try {
		claims = await boxTurn(deps.keys, request.headers, { background: true });
	} catch (error) {
		if (!(error instanceof BoxRequestError)) throw error;
		return json(error.status, {
			type: "error",
			error: {
				type:
					error.status === 401 ? "authentication_error" : "permission_error",
				message: error.message,
			},
		});
	}
	if (!deps.gatewayKey) {
		return json(503, {
			type: "error",
			error: { type: "api_error", message: "No model key is configured" },
		});
	}
	if (path !== "/v1/messages") {
		return json(404, {
			type: "error",
			error: { type: "not_found_error", message: "Unknown model route" },
		});
	}
	if (await overDailyLimit(deps, claims)) {
		return json(402, {
			type: "error",
			error: {
				type: "billing_error",
				message:
					"Today's usage limit for Devs is reached. It resets at 00:00 UTC.",
			},
		});
	}
	const body = await request.text();
	const headers = new Headers({ "x-api-key": deps.gatewayKey });
	for (const name of FORWARDED_HEADERS) {
		const value = request.headers.get(name);
		if (value) headers.set(name, value);
	}
	const upstream = await (deps.fetch ?? fetch)(
		`${GATEWAY_URL}${path}${new URL(request.url).search}`,
		{ method: "POST", headers, body },
	);
	const named = (parsed(body) as { model?: string } | null)?.model ?? "unknown";
	const responseHeaders = new Headers({
		"content-type": upstream.headers.get("content-type") ?? "application/json",
	});
	if (!upstream.ok || !upstream.body) {
		return new Response(upstream.body, {
			status: upstream.status,
			headers: responseHeaders,
		});
	}
	if (responseHeaders.get("content-type")?.includes("text/event-stream")) {
		const [toClient, toMeter] = upstream.body.tee();
		metered(
			usageFromStream(toMeter).then((usage) =>
				recordUsage(claims, named, usage),
			),
		);
		return new Response(toClient, {
			status: upstream.status,
			headers: responseHeaders,
		});
	}
	const text = await upstream.text();
	const reported = (parsed(text) as { usage?: ReportedUsage } | null)?.usage;
	metered(recordUsage(claims, named, toUsage(reported)));
	return new Response(text, {
		status: upstream.status,
		headers: responseHeaders,
	});
}

async function settled(deps: BoxApiDeps, request: Request, turnId: string) {
	const { agentId, groupId } = await boxAgent(deps.keys, request.headers);
	const id = z.string().uuid().safeParse(turnId);
	const [turn] = id.success
		? await db
				.select({ groupId: chatsTurns.groupId })
				.from(chatsTurns)
				.where(and(eq(chatsTurns.id, id.data), eq(chatsTurns.agentId, agentId)))
		: [];
	if (!id.success || turn?.groupId !== groupId) {
		throw new BoxRequestError(
			403,
			"forbidden",
			"That isn't this Dev's turn in this chat",
		);
	}
	const result = settlement.parse(await request.json());
	await settleTurn(deps.turns, { turnId: id.data, agentId }, result);
	return new Response(null, { status: 204 });
}

async function message(deps: BoxApiDeps, request: Request, endsTurn: boolean) {
	const claims = await boxTurn(deps.keys, request.headers);
	const { text } = devText.parse(await request.json());
	const posted = await postDevMessage(claims, { text, endsTurn });
	if (!posted) {
		throw new BoxRequestError(
			409,
			"not_a_reply",
			"This turn was replaced by a newer message",
		);
	}
	return json(201, { sent: true });
}

const question = z.object({
	dev: z.string().trim().min(1).max(200),
	question: z.string().trim().min(1).max(10_000),
});

/** `dev ask`: one Dev's question to another in the turn's chat, answered to the asker only. */
async function ask(deps: BoxApiDeps, request: Request) {
	const claims = await boxTurn(deps.keys, request.headers);
	const body = question.parse(await request.json());
	const answer = await askDev(deps.turns, claims, body.dev, body.question);
	return json(200, { answer });
}

const notices = z.object({ text: z.string().trim().min(1).max(40_000) });

/** The runner's notices of background work that ended while no turn ran in the chat. */
async function notice(deps: BoxApiDeps, request: Request) {
	const claims = await boxTurn(deps.keys, request.headers, {
		background: true,
	});
	const { text } = notices.parse(await request.json());
	await enqueueNoticeTurn(deps.turns, claims, text);
	return new Response(null, { status: 202 });
}

const fileShare = z.object({
	name: z
		.string()
		.trim()
		.min(1)
		.max(200)
		.transform((name) => name.split(/[\\/]/).at(-1) ?? name),
	type: z.string().trim().min(1).max(200).default("application/octet-stream"),
	message: z.string().trim().max(TEXT_MAX).default(""),
});

/** `dev file share`: the file's bytes as the body, its name, type and caption in the query. */
async function shareFile(deps: BoxApiDeps, request: Request) {
	const claims = await boxTurn(deps.keys, request.headers);
	const query = new URL(request.url).searchParams;
	const input = fileShare.parse({
		name: query.get("name") ?? "",
		type: query.get("type") ?? undefined,
		message: query.get("message") ?? undefined,
	});
	const bytes = new Uint8Array(await request.arrayBuffer());
	if (bytes.byteLength === 0 || bytes.byteLength > DEV_FILE_MAX_BYTES) {
		throw new BoxRequestError(
			413,
			"too_large",
			"A shared file is between 1 byte and 25 MB",
		);
	}
	const shared = await shareDevFile(claims, {
		name: input.name,
		contentType: input.type,
		bytes,
		text: input.message,
	});
	if (!shared) {
		throw new BoxRequestError(
			409,
			"not_a_reply",
			"This turn can't post in the chat",
		);
	}
	return json(201, shared);
}

const waitSeconds = z.coerce
	.number()
	.int()
	.min(0)
	.max(MAX_WAIT_S)
	.default(MAX_WAIT_S);

const readLimit = z.coerce.number().int().min(1).max(200).default(20);

/** What a Dev reads of its turn's chat: `/cli/messages?limit=` and `/cli/members`. */
async function read(deps: BoxApiDeps, request: Request, path: string) {
	const claims = await boxTurn(deps.keys, request.headers, {
		background: true,
	});
	if (path === "/cli/messages") {
		const limit = readLimit.parse(
			new URL(request.url).searchParams.get("limit") ?? undefined,
		);
		const { messages } = await chatForDev(claims.groupId, limit);
		return json(200, { messages });
	}
	const answer = /^\/cli\/questions\/([0-9a-f-]{36})\/answer$/.exec(path);
	if (answer?.[1]) {
		const wait = waitSeconds.parse(
			new URL(request.url).searchParams.get("wait") ?? undefined,
		);
		return json(200, await waitForAnswer(claims, answer[1], wait));
	}
	if (path === "/cli/files") {
		return json(200, { files: await chatFiles(claims.groupId) });
	}
	const content = /^\/cli\/files\/([0-9a-f-]{36})\/content$/.exec(path);
	if (content?.[1]) {
		const found = await chatFileContent(claims.groupId, content[1]);
		if (!found)
			return json(404, {
				code: "not_found",
				message: "No such file in this chat",
			});
		return new Response(found.body, {
			headers: {
				"content-type": found.file.contentType,
				"x-dev-file-name": encodeURIComponent(found.file.name),
			},
		});
	}
	if (path === "/cli/members") {
		const { people, devs } = await chatForDev(claims.groupId, 1);
		return json(200, { people, devs });
	}
	return json(404, { code: "not_found", message: "Unknown route" });
}

/**
 * What a box calls the API for. `path` is the part after the mount point:
 * `/cli/reply` (the Dev's reply, which ends its turn's live view),
 * `/cli/messages` (an update mid-turn), `/cli/turns/:id/settled` (the
 * runner's callback) and `/model/*`.
 */
export async function handleBoxRequest(
	deps: BoxApiDeps,
	request: Request,
	path: string,
): Promise<Response> {
	try {
		if (request.method === "GET") return await read(deps, request, path);
		if (request.method !== "POST") return json(405, { message: "Not allowed" });
		if (path.startsWith("/model/")) {
			return await model(deps, request, path.slice("/model".length));
		}
		const settle = /^\/cli\/turns\/([^/]+)\/settled$/.exec(path);
		if (settle?.[1]) return await settled(deps, request, settle[1]);
		if (path === "/cli/ask") return await ask(deps, request);
		if (path === "/cli/notifications") return await notice(deps, request);
		if (path === "/cli/files") return await shareFile(deps, request);
		if (path === "/cli/questions") {
			const claims = await boxTurn(deps.keys, request.headers);
			const asked = askSchema.parse(await request.json());
			return json(201, { question: await askQuestion(claims, asked) });
		}
		const settling =
			/^\/cli\/questions\/([0-9a-f-]{36})\/(release|cancel)$/.exec(path);
		if (settling?.[1]) {
			const claims = await boxTurn(deps.keys, request.headers);
			if (settling[2] === "release") {
				return json(200, await releaseQuestion(claims, settling[1]));
			}
			await cancelQuestion(claims, settling[1]);
			return new Response(null, { status: 204 });
		}
		if (path === "/cli/reply") return await message(deps, request, true);
		if (path === "/cli/messages") return await message(deps, request, false);
		return json(404, { code: "not_found", message: "Unknown route" });
	} catch (error) {
		if (error instanceof AskError) {
			return json(error.status, { code: "ask", message: error.message });
		}
		if (error instanceof BoxRequestError || error instanceof QuestionError) {
			return json(error.status, { code: error.code, message: error.message });
		}
		if (error instanceof z.ZodError) {
			return json(400, {
				code: "invalid",
				message: error.issues[0]?.message ?? "Invalid request",
			});
		}
		console.error("[chats] box request failed:", error);
		return json(500, { code: "error", message: "Something went wrong" });
	}
}
