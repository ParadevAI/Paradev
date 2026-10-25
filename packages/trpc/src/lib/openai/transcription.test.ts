import { describe, expect, test } from "bun:test";
import { TranscriptionError, transcribeAudio } from "./transcription";

const input = {
	apiKey: "sk-test",
	model: "gpt-4o-mini-transcribe",
	audio: new Uint8Array([1, 2, 3]),
	fileName: "dictation.webm",
	mimeType: "audio/webm",
};

describe("transcribeAudio", () => {
	test("posts the clip as multipart and returns the trimmed text", async () => {
		let sent: { url: string; init: RequestInit } | null = null;
		const fetchImpl = (async (
			url: string | URL | Request,
			init?: RequestInit,
		) => {
			sent = { url: String(url), init: init ?? {} };
			return new Response(JSON.stringify({ text: " Ship it. \n" }), {
				status: 200,
			});
		}) as typeof fetch;

		expect(await transcribeAudio(input, fetchImpl)).toBe("Ship it.");
		const request = sent as unknown as { url: string; init: RequestInit };
		expect(request.url).toBe("https://api.openai.com/v1/audio/transcriptions");
		const headers = request.init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer sk-test");
		const form = request.init.body as FormData;
		expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
		const file = form.get("file") as File;
		expect(file.name).toBe("dictation.webm");
		expect(file.type).toBe("audio/webm");
		expect(new Uint8Array(await file.arrayBuffer())).toEqual(input.audio);
	});

	test("surfaces an upstream failure with its status", async () => {
		const fetchImpl = (async () =>
			new Response("rate limited", { status: 429 })) as typeof fetch;
		const failure = await transcribeAudio(input, fetchImpl).catch(
			(error: unknown) => error,
		);
		expect(failure).toBeInstanceOf(TranscriptionError);
		expect((failure as TranscriptionError).status).toBe(429);
	});

	test("rejects a response without text", async () => {
		const fetchImpl = (async () =>
			new Response(JSON.stringify({}), { status: 200 })) as typeof fetch;
		await expect(transcribeAudio(input, fetchImpl)).rejects.toThrow(
			/missing text/,
		);
	});
});
