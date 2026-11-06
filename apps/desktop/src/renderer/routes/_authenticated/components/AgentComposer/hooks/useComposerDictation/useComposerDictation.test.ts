import { describe, expect, test } from "bun:test";
import { DictationError } from "@superset/chat-ui/PromptInput";
import { DICTATION_MAX_AUDIO_BYTES } from "@superset/shared/voice";
import { TRPCClientError } from "@trpc/client";
import { createComposerDictation } from "./useComposerDictation";

function serverError(code: string) {
	return new TRPCClientError("server said no", {
		result: { error: { data: { code } } },
	} as never);
}

function setup(
	request: Parameters<typeof createComposerDictation>[0]["request"],
) {
	const notices: string[] = [];
	const dictation = createComposerDictation({
		request,
		notify: (message) => notices.push(message),
	});
	return { dictation, notices };
}

async function failure(promise: Promise<unknown> | unknown) {
	const error = await Promise.resolve(promise).catch((cause: unknown) => cause);
	expect(error).toBeInstanceOf(DictationError);
	return error as DictationError;
}

const clip = new Blob(["hi"], { type: "audio/webm;codecs=opus" });
const live = { signal: new AbortController().signal };

describe("createComposerDictation", () => {
	test("sends the clip as base64 with its type and returns the text", async () => {
		const sent: { audio: string; mimeType: string }[] = [];
		const { dictation } = setup(async (input) => {
			sent.push(input);
			return { text: "ship it" };
		});
		expect(await dictation.transcribe(clip, live)).toBe("ship it");
		expect(sent).toEqual([
			{ audio: btoa("hi"), mimeType: "audio/webm;codecs=opus" },
		]);
	});

	test("marks a network failure retryable and leaves the toast to the composer row", async () => {
		const { dictation, notices } = setup(async () => {
			throw new TRPCClientError("Failed to fetch");
		});
		const error = await failure(dictation.transcribe(clip, live));
		expect(error.canRetry).toBe(true);
		dictation.onError?.(error);
		expect(notices).toEqual([]);
	});

	test("marks a rate limit retryable", async () => {
		const { dictation } = setup(async () => {
			throw serverError("TOO_MANY_REQUESTS");
		});
		expect((await failure(dictation.transcribe(clip, live))).canRetry).toBe(
			true,
		);
	});

	test("toasts a failure that cannot be retried, e.g. an API without the procedure", async () => {
		const { dictation, notices } = setup(async () => {
			throw serverError("NOT_FOUND");
		});
		const error = await failure(dictation.transcribe(clip, live));
		expect(error.canRetry).toBe(false);
		dictation.onError?.(error);
		expect(notices).toEqual([error.message]);
	});

	test("does not retry a recording the server could not read", async () => {
		const { dictation } = setup(async () => {
			throw serverError("BAD_REQUEST");
		});
		expect((await failure(dictation.transcribe(clip, live))).canRetry).toBe(
			false,
		);
	});

	test("uses the on-device result without calling the API", async () => {
		let called = false;
		const dictation = createComposerDictation({
			request: async () => {
				called = true;
				return { text: "from the API" };
			},
			notify: () => {},
			transcribeOnDesktop: async () => ({ ok: true, text: "from the Mac" }),
		});
		expect(await dictation.transcribe(clip, live)).toBe("from the Mac");
		expect(called).toBe(false);
	});

	test("falls back to the API when on-device transcription fails", async () => {
		const dictation = createComposerDictation({
			request: async () => ({ text: "from the API" }),
			notify: () => {},
			transcribeOnDesktop: async () => ({
				ok: false,
				error: "unsupported-locale",
				message: "no model",
			}),
		});
		expect(await dictation.transcribe(clip, live)).toBe("from the API");
		const throwing = createComposerDictation({
			request: async () => ({ text: "from the API" }),
			notify: () => {},
			transcribeOnDesktop: async () => {
				throw new Error("decode failed");
			},
		});
		expect(await throwing.transcribe(clip, live)).toBe("from the API");
	});

	test("does not reach the API for a clip cancelled during the desktop attempt", async () => {
		const controller = new AbortController();
		let called = false;
		const dictation = createComposerDictation({
			request: async () => {
				called = true;
				return { text: "from the API" };
			},
			notify: () => {},
			transcribeOnDesktop: async () => {
				controller.abort();
				return { ok: false, error: "aborted", message: "stopped" };
			},
		});
		await expect(
			Promise.resolve(
				dictation.transcribe(clip, { signal: controller.signal }),
			),
		).rejects.toThrow();
		expect(called).toBe(false);
	});

	test("refuses a clip over the size cap without calling the API", async () => {
		let called = false;
		const { dictation } = setup(async () => {
			called = true;
			return { text: "" };
		});
		const oversized = new Blob([new Uint8Array(DICTATION_MAX_AUDIO_BYTES + 1)]);
		expect(
			(await failure(dictation.transcribe(oversized, live))).canRetry,
		).toBe(false);
		expect(called).toBe(false);
	});
});
