import { describe, expect, test } from "bun:test";
import { messageFootnote } from "./message-footnote.ts";

describe("messageFootnote", () => {
	test("says it was edited, which key sent it, or both", () => {
		expect(messageFootnote({ text: "hi" })).toBeNull();
		expect(
			messageFootnote({ text: "hi", editedAt: "2026-10-26T09:00:00Z" }),
		).toBe("Edited");
		expect(messageFootnote({ text: "hi", viaKey: "Claude Code" })).toBe(
			"via Claude Code",
		);
		expect(
			messageFootnote({
				text: "hi",
				editedAt: "2026-10-26T09:00:00Z",
				viaKey: "Claude Code",
			}),
		).toBe("Edited · via Claude Code");
	});

	test("nothing under a message without text", () => {
		expect(messageFootnote({ text: " ", viaKey: "Claude Code" })).toBeNull();
	});
});
