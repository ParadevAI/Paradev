import { describe, expect, test } from "bun:test";
import {
	DEV_VOICES,
	devVoice,
	isDevVoiceId,
	voicePreviewText,
} from "./dev-voices.ts";

describe("dev voices", () => {
	test("a varied list of distinct ElevenLabs ids, each described with its accent", () => {
		expect(DEV_VOICES.length).toBeGreaterThanOrEqual(8);
		expect(DEV_VOICES.length).toBeLessThanOrEqual(12);
		expect(new Set(DEV_VOICES.map((v) => v.id)).size).toBe(DEV_VOICES.length);
		for (const v of DEV_VOICES) {
			expect(v.id).toMatch(/^[A-Za-z0-9]{20}$/);
			expect(v.description).toContain(" · ");
		}
	});

	test("only listed ids are voices; null is the default", () => {
		expect(isDevVoiceId("pFZP5JQG7iQjIQuC4Bku")).toBe(true);
		expect(isDevVoiceId("nope")).toBe(false);
		expect(isDevVoiceId(null)).toBe(false);
		expect(devVoice("pFZP5JQG7iQjIQuC4Bku")?.name).toBe("Lily");
		expect(devVoice(null)).toBeUndefined();
		expect(devVoice("gone")).toBeUndefined();
	});

	test("a preview introduces the Dev by name", () => {
		expect(voicePreviewText("Juniper")).toBe(
			"Hi, I'm Juniper. This is how I sound.",
		);
		expect(voicePreviewText("  ")).toBe("Hi, I'm Dev. This is how I sound.");
	});
});
