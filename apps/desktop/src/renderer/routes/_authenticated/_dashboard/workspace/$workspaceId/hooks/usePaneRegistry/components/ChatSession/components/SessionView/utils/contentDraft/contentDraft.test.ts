import { describe, expect, test } from "bun:test";
import { withQuotedReplies } from "@superset/chat/core";
import { contentDraft } from "./contentDraft";

describe("contentDraft", () => {
	test("gives a sent prompt's quotes back as quote cards", () => {
		expect(
			contentDraft([
				{ type: "text", text: withQuotedReplies(["a\nb"], "why?") },
				{ type: "text", text: "context", hidden: true },
			]),
		).toEqual({
			segments: [{ type: "text", text: "why?" }],
			attachments: [],
			quotes: ["a\nb"],
		});
	});

	test("keeps a prompt without quotes as text", () => {
		expect(contentDraft([{ type: "text", text: "hi" }])).toEqual({
			segments: [{ type: "text", text: "hi" }],
			attachments: [],
		});
	});
});
