import { describe, expect, test } from "bun:test";
import { spokenWordsOf } from "./spoken-words.ts";

describe("a spoken reply's words", () => {
	test("as the voice said them, when the note has them", () => {
		const words = [{ text: "Done,", startMs: 0, endMs: 300 }];
		expect(spokenWordsOf(words, "Done, **Priya**", 900)).toEqual(words);
	});

	test("else its plain text spread over its length by characters", () => {
		expect(spokenWordsOf(undefined, "Hi **there**", 900)).toEqual([
			{ text: "Hi", startMs: 0, endMs: 200 },
			{ text: "there", startMs: 300, endMs: 800 },
		]);
		expect(spokenWordsOf([], "", 900)).toEqual([]);
	});
});
