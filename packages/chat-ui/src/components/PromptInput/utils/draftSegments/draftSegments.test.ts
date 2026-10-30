import { describe, expect, test } from "bun:test";
import { CodeNode } from "@lexical/code";
import { ListItemNode, ListNode } from "@lexical/list";
import { QuoteNode } from "@lexical/rich-text";
import { $getRoot, createEditor } from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type { ComposerDraftSegment } from "../../types";
import {
	$appendDraftSegments,
	$readDraftSegments,
	draftText,
	promptText,
} from "./draftSegments";

const chip = { label: "Linear", serialized: "@linear", data: { id: 7 } };

function editorWith(...drafts: ComposerDraftSegment[][]) {
	const editor = createEditor({
		nodes: [MentionChipNode, ListNode, ListItemNode, QuoteNode, CodeNode],
		onError: (error) => {
			throw error;
		},
	});
	let read: ComposerDraftSegment[] = [];
	let text = "";
	editor.update(
		() => {
			for (const draft of drafts) $appendDraftSegments(draft);
			read = $readDraftSegments();
			text = $getRoot().getTextContent();
		},
		{ discrete: true },
	);
	return { read, text };
}

describe("draft segments", () => {
	test("text, chips and line breaks survive a round trip", () => {
		const segments: ComposerDraftSegment[] = [
			{ type: "text", text: "fix " },
			{ type: "chip", chip },
			{ type: "text", text: " now\nplease" },
		];
		expect(editorWith(segments).read).toEqual(segments);
	});

	test("lists, formats and code blocks survive a round trip", () => {
		const segments: ComposerDraftSegment[] = [
			{ type: "text", text: "Plan:\n- read **the** " },
			{ type: "chip", chip },
			{
				type: "text",
				text: " issue\n    - then *fix* it\n1. ship\n> careful\n```\nconst a = 1;\n```",
			},
		];
		const { read, text } = editorWith(segments);
		expect(read).toEqual(segments);
		expect(text).not.toContain("- read");
	});

	test("prompt text that only looks like markdown stays literal", () => {
		const segments: ComposerDraftSegment[] = [
			{ type: "text", text: "call __init__ with *args, ~/src/a_b.py" },
		];
		const { read, text } = editorWith(segments);
		expect(text).toBe(draftText(segments));
		expect(read).toEqual(segments);
	});

	test("a formatted edge space reaches the agent as a space", () => {
		const { read } = editorWith([{ type: "text", text: "**word&#32;**next" }]);
		expect(draftText(read)).toBe("**word **next");
	});

	test("appending keeps the existing content first", () => {
		const { read } = editorWith(
			[{ type: "text", text: "- one" }],
			[{ type: "text", text: "two" }],
		);
		expect(draftText(read)).toBe("- one\ntwo");
	});

	test("an empty editor reads as no segments", () => {
		expect(editorWith([]).read).toEqual([]);
	});

	test("the prompt drops empty bullets and blank lines at its ends", () => {
		expect(promptText([{ type: "text", text: "-" }])).toBe("");
		expect(promptText([{ type: "text", text: "\n- a\n- b\n- \n1. \n>" }])).toBe(
			"- a\n- b",
		);
		expect(promptText([{ type: "text", text: "- a\n-\n- b" }])).toBe(
			"- a\n-\n- b",
		);
	});
});
