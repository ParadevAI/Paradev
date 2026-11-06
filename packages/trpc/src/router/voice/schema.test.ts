import { describe, expect, test } from "bun:test";
import { DICTATION_MAX_AUDIO_BYTES } from "@superset/shared/voice";
import { dictationAudioExtension, transcribeSchema } from "./schema";

const clip = Buffer.from("not really opus").toString("base64");

describe("transcribeSchema", () => {
	test("accepts a MediaRecorder webm clip", () => {
		expect(
			transcribeSchema.safeParse({
				audio: clip,
				mimeType: "audio/webm;codecs=opus",
			}).success,
		).toBe(true);
	});

	test("rejects an empty clip", () => {
		expect(
			transcribeSchema.safeParse({ audio: "", mimeType: "audio/webm" }).success,
		).toBe(false);
	});

	test("rejects text that is not base64", () => {
		expect(
			transcribeSchema.safeParse({
				audio: "not base64!",
				mimeType: "audio/webm",
			}).success,
		).toBe(false);
	});

	test("rejects a clip over the size cap", () => {
		const oversized = Buffer.alloc(DICTATION_MAX_AUDIO_BYTES + 1).toString(
			"base64",
		);
		expect(
			transcribeSchema.safeParse({ audio: oversized, mimeType: "audio/webm" })
				.success,
		).toBe(false);
	});

	test("accepts a clip at the size cap", () => {
		const atCap = Buffer.alloc(DICTATION_MAX_AUDIO_BYTES).toString("base64");
		expect(
			transcribeSchema.safeParse({ audio: atCap, mimeType: "audio/webm" })
				.success,
		).toBe(true);
	});

	test("rejects a type OpenAI cannot transcribe", () => {
		expect(
			transcribeSchema.safeParse({ audio: clip, mimeType: "video/webm" })
				.success,
		).toBe(false);
		expect(
			transcribeSchema.safeParse({ audio: clip, mimeType: "constructor" })
				.success,
		).toBe(false);
	});
});

describe("dictationAudioExtension", () => {
	test("maps a base type with codec parameters to its extension", () => {
		expect(dictationAudioExtension("audio/webm;codecs=opus")).toBe("webm");
		expect(dictationAudioExtension("Audio/MPEG")).toBe("mp3");
		expect(dictationAudioExtension("audio/aiff")).toBeNull();
	});
});
