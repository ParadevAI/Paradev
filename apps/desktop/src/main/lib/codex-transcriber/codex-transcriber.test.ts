import { describe, expect, test } from "bun:test";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import {
	createCodexTranscriber,
	readCodexChatGptToken,
	tokenExpiresAt,
} from "./codex-transcriber";

function jwt(expSeconds: number) {
	const part = (value: object) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "none" })}.${part({ exp: expSeconds })}.sig`;
}

function fakeAppServer(authStatus: Record<string, unknown>) {
	const requests: { method: string; params?: unknown }[] = [];
	let killed = false;
	const spawnAppServer = () => {
		const child = new EventEmitter() as ChildProcessWithoutNullStreams;
		const stdin = new PassThrough();
		const stdout = new PassThrough();
		Object.assign(child, {
			stdin,
			stdout,
			stderr: new PassThrough(),
			kill: () => {
				killed = true;
				return true;
			},
		});
		stdin.setEncoding("utf8");
		stdin.on("data", (chunk: string) => {
			for (const line of chunk.split("\n").filter(Boolean)) {
				const message = JSON.parse(line);
				requests.push(message);
				if (message.id === 2)
					stdout.write(`${JSON.stringify({ id: 2, result: authStatus })}\n`);
			}
		});
		return child;
	};
	return { spawnAppServer, requests, wasKilled: () => killed };
}

describe("readCodexChatGptToken", () => {
	test("returns the token of a ChatGPT sign-in and stops the app-server", async () => {
		const server = fakeAppServer({ authMethod: "chatgpt", authToken: "tok" });
		const token = await readCodexChatGptToken({
			env: {},
			refresh: true,
			spawnAppServer: server.spawnAppServer,
		});
		expect(token).toBe("tok");
		expect(server.requests.map((request) => request.method)).toEqual([
			"initialize",
			"initialized",
			"getAuthStatus",
		]);
		expect(server.requests[2]?.params).toEqual({
			includeToken: true,
			refreshToken: true,
		});
		expect(server.wasKilled()).toBe(true);
	});

	test("ignores an API-key sign-in", async () => {
		const server = fakeAppServer({ authMethod: "apikey", authToken: "sk" });
		expect(
			await readCodexChatGptToken({
				env: {},
				refresh: false,
				spawnAppServer: server.spawnAppServer,
			}),
		).toBeNull();
	});

	test("gives up when Codex never answers", async () => {
		const silent = () => {
			const child = new EventEmitter() as ChildProcessWithoutNullStreams;
			Object.assign(child, {
				stdin: new PassThrough(),
				stdout: new PassThrough(),
				stderr: new PassThrough(),
				kill: () => true,
			});
			return child;
		};
		expect(
			await readCodexChatGptToken({
				env: {},
				refresh: false,
				spawnAppServer: silent,
				timeoutMs: 10,
			}),
		).toBeNull();
	});
});

describe("createCodexTranscriber", () => {
	const wav = new Uint8Array([1, 2, 3]);

	test("is skipped without a ChatGPT sign-in, asking Codex once per window", async () => {
		let reads = 0;
		const transcriber = createCodexTranscriber({
			readToken: async () => {
				reads += 1;
				return null;
			},
			fetchImpl: (async () => new Response("{}")) as unknown as typeof fetch,
		});
		expect(await transcriber.transcribe(wav)).toBeNull();
		expect(await transcriber.transcribe(wav)).toBeNull();
		expect(reads).toBe(1);
	});

	test("notices a ChatGPT sign-in made after a signed-out read", async () => {
		let now = 0;
		let signedIn = false;
		const transcriber = createCodexTranscriber({
			now: () => now,
			readToken: async () => (signedIn ? "tok" : null),
			fetchImpl: (async () =>
				new Response(
					JSON.stringify({ text: "ok" }),
				)) as unknown as typeof fetch,
		});
		expect(await transcriber.transcribe(wav)).toBeNull();
		signedIn = true;
		now += 60_000;
		expect(await transcriber.transcribe(wav)).toEqual({ ok: true, text: "ok" });
	});

	test("two clips at once read the token once", async () => {
		let reads = 0;
		const transcriber = createCodexTranscriber({
			readToken: async () => {
				reads += 1;
				return "tok";
			},
			fetchImpl: (async () =>
				new Response(
					JSON.stringify({ text: "ok" }),
				)) as unknown as typeof fetch,
		});
		await Promise.all([
			transcriber.transcribe(wav),
			transcriber.transcribe(wav),
		]);
		expect(reads).toBe(1);
	});

	test("aborts the upload when the caller cancels", async () => {
		const controller = new AbortController();
		let uploadSignal: AbortSignal | undefined;
		const transcriber = createCodexTranscriber({
			readToken: async () => "tok",
			fetchImpl: (async (_url: string, init: RequestInit) => {
				uploadSignal = init.signal ?? undefined;
				controller.abort();
				return new Response(JSON.stringify({ text: "ok" }));
			}) as unknown as typeof fetch,
		});
		await transcriber.transcribe(wav, controller.signal);
		expect(uploadSignal?.aborted).toBe(true);
	});

	test("posts the clip with the session token and Superset's own name", async () => {
		const sent: RequestInit[] = [];
		const transcriber = createCodexTranscriber({
			readToken: async () => "tok",
			fetchImpl: (async (_url: string, init: RequestInit) => {
				sent.push(init);
				return new Response(JSON.stringify({ text: " ship it " }));
			}) as unknown as typeof fetch,
		});
		expect(await transcriber.transcribe(wav)).toEqual({
			ok: true,
			text: "ship it",
		});
		const headers = sent[0]?.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer tok");
		expect(headers["User-Agent"]).toBe("Superset");
		expect((sent[0]?.body as FormData).get("file")).toBeInstanceOf(Blob);
	});

	test("refreshes the token once after a 401", async () => {
		const refreshes: boolean[] = [];
		let calls = 0;
		const transcriber = createCodexTranscriber({
			readToken: async (refresh) => {
				refreshes.push(refresh);
				return refresh ? "fresh" : "stale";
			},
			fetchImpl: (async () => {
				calls += 1;
				return calls === 1
					? new Response("", { status: 401 })
					: new Response(JSON.stringify({ text: "ok" }));
			}) as unknown as typeof fetch,
		});
		expect(await transcriber.transcribe(wav)).toEqual({ ok: true, text: "ok" });
		expect(refreshes).toEqual([false, true]);
	});

	test("refreshes an expired token before posting", async () => {
		const now = 1_000_000_000_000;
		const refreshes: boolean[] = [];
		const bearers: string[] = [];
		const fresh = jwt(now / 1000 + 3600);
		const transcriber = createCodexTranscriber({
			now: () => now,
			readToken: async (refresh) => {
				refreshes.push(refresh);
				return refresh ? fresh : jwt(now / 1000 - 10);
			},
			fetchImpl: (async (_url: string, init: RequestInit) => {
				bearers.push((init.headers as Record<string, string>).Authorization);
				return new Response(JSON.stringify({ text: "ok" }));
			}) as unknown as typeof fetch,
		});
		expect(await transcriber.transcribe(wav)).toEqual({ ok: true, text: "ok" });
		expect(refreshes).toEqual([false, true]);
		expect(bearers).toEqual([`Bearer ${fresh}`]);
		expect(tokenExpiresAt(fresh)).toBe(now + 3_600_000);
	});

	test("reports a failed refresh and asks Codex again on the next clip", async () => {
		let reads = 0;
		const transcriber = createCodexTranscriber({
			readToken: async (refresh) => {
				reads += 1;
				return refresh ? null : "tok";
			},
			fetchImpl: (async () =>
				new Response("", { status: 401 })) as unknown as typeof fetch,
		});
		expect((await transcriber.transcribe(wav))?.ok).toBe(false);
		await transcriber.transcribe(wav);
		expect(reads).toBe(4);
	});

	test("reports an upstream error so the caller can fall back", async () => {
		const transcriber = createCodexTranscriber({
			readToken: async () => "tok",
			fetchImpl: (async () =>
				new Response("", { status: 503 })) as unknown as typeof fetch,
		});
		expect((await transcriber.transcribe(wav))?.ok).toBe(false);
	});
});
