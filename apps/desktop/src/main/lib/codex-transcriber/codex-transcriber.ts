import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import type { NativeTranscription } from "../native-transcriber";

const TRANSCRIBE_URL = "https://chatgpt.com/backend-api/transcribe";
const APP_SERVER_TIMEOUT_MS = 10_000;
const TRANSCRIBE_TIMEOUT_MS = 30_000;
// Also how long a sign-out in Codex can go unnoticed.
const TOKEN_TTL_MS = 60_000;
// Short, so a new sign-in is used soon, but clips in a row start Codex once.
const SIGNED_OUT_TTL_MS = 30_000;
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

type SpawnAppServer = (
	env: NodeJS.ProcessEnv,
) => ChildProcessWithoutNullStreams;

const spawnCodexAppServer: SpawnAppServer = (env) =>
	spawn("codex", ["app-server"], { env, stdio: ["pipe", "pipe", "pipe"] });

/** The token of a ChatGPT sign-in in Codex, or null for none or an API key. */
export function readCodexChatGptToken({
	env,
	refresh,
	spawnAppServer = spawnCodexAppServer,
	timeoutMs = APP_SERVER_TIMEOUT_MS,
}: {
	env: NodeJS.ProcessEnv;
	refresh: boolean;
	spawnAppServer?: SpawnAppServer;
	timeoutMs?: number;
}): Promise<string | null> {
	return new Promise((resolve) => {
		let child: ChildProcessWithoutNullStreams;
		try {
			child = spawnAppServer(env);
		} catch {
			resolve(null);
			return;
		}
		let buffered = "";
		let settled = false;
		const finish = (token: string | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			child.kill();
			resolve(token);
		};
		const timer = setTimeout(() => finish(null), timeoutMs);
		child.on("error", () => finish(null));
		child.on("exit", () => finish(null));
		// Without Codex installed, writes fail with EPIPE.
		child.stdin.on("error", () => finish(null));
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			buffered += chunk;
			let newline = buffered.indexOf("\n");
			while (newline >= 0) {
				const line = buffered.slice(0, newline);
				buffered = buffered.slice(newline + 1);
				newline = buffered.indexOf("\n");
				let message: { id?: unknown; result?: Record<string, unknown> };
				try {
					message = JSON.parse(line);
				} catch {
					continue;
				}
				if (message.id !== 2) continue;
				const result = message.result ?? {};
				finish(
					result.authMethod === "chatgpt" &&
						typeof result.authToken === "string"
						? result.authToken
						: null,
				);
			}
		});
		const write = (message: object) =>
			child.stdin.write(`${JSON.stringify(message)}\n`);
		write({
			id: 1,
			method: "initialize",
			params: {
				clientInfo: { name: "superset", title: "Superset", version: "1" },
			},
		});
		write({ method: "initialized" });
		write({
			id: 2,
			method: "getAuthStatus",
			params: { includeToken: true, refreshToken: refresh },
		});
	});
}

export function tokenExpiresAt(token: string): number | null {
	const payload = token.split(".")[1];
	if (!payload) return null;
	try {
		const { exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
		return typeof exp === "number" ? exp * 1000 : null;
	} catch {
		return null;
	}
}

export function createCodexTranscriber({
	readToken,
	fetchImpl = fetch,
	now = Date.now,
}: {
	readToken: (refresh: boolean) => Promise<string | null>;
	fetchImpl?: Fetch;
	now?: () => number;
}) {
	let cached: { token: string | null; at: number } | null = null;
	let pendingRead: Promise<string | null> | null = null;

	const isFresh = (token: string) => {
		const expiresAt = tokenExpiresAt(token);
		return expiresAt === null || expiresAt - TOKEN_EXPIRY_MARGIN_MS > now();
	};

	const read = (refresh: boolean): Promise<string | null> => {
		if (!refresh && pendingRead) return pendingRead;
		const reading = readToken(refresh)
			.catch(() => null)
			.then((next) => {
				cached = { token: next, at: now() };
				return next;
			})
			.finally(() => {
				if (pendingRead === reading) pendingRead = null;
			});
		if (!refresh) pendingRead = reading;
		return reading;
	};

	const token = async () => {
		const ttl = cached?.token ? TOKEN_TTL_MS : SIGNED_OUT_TTL_MS;
		if (cached && now() - cached.at < ttl) {
			if (cached.token === null || isFresh(cached.token)) return cached.token;
		}
		const next = await read(false);
		return next && !isFresh(next) ? read(true) : next;
	};

	const post = (
		wav: Uint8Array<ArrayBuffer>,
		bearer: string,
		signal?: AbortSignal,
	) => {
		const form = new FormData();
		form.set("file", new Blob([wav], { type: "audio/wav" }), "dictation.wav");
		return fetchImpl(TRANSCRIBE_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${bearer}`,
				originator: "superset",
				"User-Agent": "Superset",
			},
			body: form,
			signal: AbortSignal.any([
				AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
				...(signal ? [signal] : []),
			]),
		});
	};

	return {
		async signedIn() {
			return (await token()) !== null;
		},

		/** Null when Codex has no ChatGPT sign-in. */
		async transcribe(
			wav: Uint8Array<ArrayBuffer>,
			signal?: AbortSignal,
		): Promise<NativeTranscription | null> {
			let bearer = await token();
			if (!bearer) return null;
			try {
				let response = await post(wav, bearer, signal);
				if (response.status === 401 || response.status === 403) {
					bearer = await read(true);
					if (!bearer) {
						// Still signed in as far as we know: try Codex again next clip.
						cached = null;
						return {
							ok: false,
							error: "failed",
							message: "Codex could not refresh its ChatGPT session",
						};
					}
					response = await post(wav, bearer, signal);
				}
				if (!response.ok)
					return {
						ok: false,
						error: "failed",
						message: `ChatGPT transcription returned ${response.status}${
							response.headers.get("cf-mitigated")
								? ` (cf-mitigated: ${response.headers.get("cf-mitigated")})`
								: ""
						}`,
					};
				const body = (await response.json()) as { text?: unknown };
				if (typeof body.text !== "string")
					return {
						ok: false,
						error: "failed",
						message: "ChatGPT transcription returned no text",
					};
				return { ok: true, text: body.text.trim() };
			} catch (error) {
				return {
					ok: false,
					error: "failed",
					message: error instanceof Error ? error.message : String(error),
				};
			}
		},
	};
}
