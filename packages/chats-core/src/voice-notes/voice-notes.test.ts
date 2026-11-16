import { describe, expect, test } from "bun:test";
import {
	callSpeechText,
	levelFromDecibels,
	MAX_SPOKEN_CHARS,
	speakableText,
	spokenWordAt,
	transcriptShown,
	voiceDuration,
	waveformBars,
	wavFromPcm,
	wordsFromAlignment,
} from "./voice-notes.ts";

describe("voice notes", () => {
	test("durations read as minutes and seconds", () => {
		expect(voiceDuration(0)).toBe("0:00");
		expect(voiceDuration(6_400)).toBe("0:06");
		expect(voiceDuration(102_000)).toBe("1:42");
	});

	test("a waveform is the loudest of each stretch, scaled to the loudest bar", () => {
		expect(waveformBars([0, 2, 1, 4, 0, 0, 1, 1], 4)).toEqual([
			0.5, 1, 0, 0.25,
		]);
		// Fewer levels than bars repeat them rather than leave gaps.
		expect(waveformBars([1, 3], 4)).toEqual([0.33, 0.33, 1, 1]);
		expect(waveformBars([], 3)).toEqual([0, 0, 0]);
		expect(waveformBars([0, 0], 2)).toEqual([0, 0]);
	});

	test("meter decibels become levels, with silence below -50 dB", () => {
		expect(levelFromDecibels(-160)).toBe(0);
		expect(levelFromDecibels(-50)).toBe(0);
		expect(levelFromDecibels(0)).toBe(1);
		expect(levelFromDecibels(-25)).toBeCloseTo(0.33, 2);
		expect(levelFromDecibels(Number.NaN)).toBe(0);
	});

	test("a reply is spoken without its markdown, and not when it's code, a table or long", () => {
		expect(
			speakableText(
				"**Done**, Priya's at 4 now. See [her calendar](https://cal.example/p).",
			),
		).toBe("Done, Priya's at 4 now. See her calendar.");
		expect(speakableText("It's here: https://example.com/x")).toBe(
			"It's here:",
		);
		expect(speakableText("Run this:\n```\nls\n```")).toBeNull();
		expect(speakableText("| a | b |\n|---|---|\n| 1 | 2 |")).toBeNull();
		expect(speakableText("a".repeat(MAX_SPOKEN_CHARS + 1))).toBeNull();
	});

	test("on a call, what doesn't read well is said around and pointed at, rather than left unsaid", () => {
		expect(callSpeechText("**Sure**, moving it to four.")).toBe(
			"Sure, moving it to four.",
		);
		expect(callSpeechText("Run this:\n```\nls\n```\nthen tell me.")).toBe(
			"Run this: then tell me. The rest is in the chat.",
		);
		expect(callSpeechText("| a | b |\n|---|---|\n| 1 | 2 |")).toBe(
			"It's in the chat.",
		);
		const sentence = "Here is one more thing to know. ";
		const long = sentence.repeat(40);
		const said = callSpeechText(long)!;
		expect(said.endsWith(" The rest is in the chat.")).toBe(true);
		expect(said.length).toBeLessThanOrEqual(MAX_SPOKEN_CHARS + 25);
		// Cut at a sentence, never mid-word.
		expect(
			said.replace(" The rest is in the chat.", "").endsWith("to know."),
		).toBe(true);
		expect(callSpeechText(`${"a".repeat(MAX_SPOKEN_CHARS + 50)} b`)).toBe(
			`${"a".repeat(MAX_SPOKEN_CHARS)} The rest is in the chat.`,
		);
		expect(callSpeechText("   ")).toBeNull();
		expect(speakableText("   ")).toBeNull();
	});

	test("a Dev's spoken reply keeps its words folded; a person's note shows them", () => {
		expect(transcriptShown({ authorDevId: "m1" })).toBe(false);
		expect(transcriptShown({})).toBe(true);
	});

	test("character timings become words, and the word being said is found by time", () => {
		const text = "Done, Priya's at 4.";
		const chars = [...text];
		const words = wordsFromAlignment({
			characters: chars,
			character_start_times_seconds: chars.map((_, i) => i * 0.05),
			character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.05),
		});
		expect(words.map((w) => w.text)).toEqual(["Done,", "Priya's", "at", "4."]);
		expect(words[1]).toEqual({ text: "Priya's", startMs: 300, endMs: 650 });
		expect(spokenWordAt(words, 0)).toBe(0);
		expect(spokenWordAt(words, 320)).toBe(1);
		expect(spokenWordAt(words, 10_000)).toBe(3);
		expect(spokenWordAt([{ text: "Hi", startMs: 100, endMs: 300 }], 50)).toBe(
			-1,
		);
	});

	test("16-bit PCM wraps as a WAV file", () => {
		const pcm = new Uint8Array(new Int16Array([0, 1000, -1000, 0]).buffer);
		const wav = wavFromPcm(pcm, 22_050);
		expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
		expect(new TextDecoder().decode(wav.subarray(8, 12))).toBe("WAVE");
		expect(new DataView(wav.buffer).getUint32(24, true)).toBe(22_050);
		expect(wav.byteLength).toBe(44 + pcm.byteLength);
		expect(wav.subarray(44)).toEqual(pcm);
	});
});
