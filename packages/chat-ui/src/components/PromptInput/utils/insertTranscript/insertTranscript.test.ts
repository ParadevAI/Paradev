import { describe, expect, it } from "bun:test";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	$isTextNode,
	createEditor,
	type LexicalNode,
	type ParagraphNode,
} from "lexical";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import { $insertTranscript } from "./insertTranscript";

// A headless editor drops its selection between updates, so each case builds
// the draft, places the cursor and inserts in one update.
function insertInto(
	buildDraft: () => LexicalNode[],
	transcript: string,
	placeCursor?: (paragraph: ParagraphNode) => void,
): string {
	const editor = createEditor({
		namespace: "insert-transcript-test",
		nodes: [MentionChipNode],
		onError: (error) => {
			throw error;
		},
	});
	editor.update(
		() => {
			const paragraph = $createParagraphNode();
			paragraph.append(...buildDraft());
			$getRoot().clear().append(paragraph);
			placeCursor?.(paragraph);
			$insertTranscript(transcript);
		},
		{ discrete: true },
	);
	return editor.getEditorState().read(() => $getRoot().getTextContent());
}

function selectText(anchor: number, focus: number) {
	return (paragraph: ParagraphNode) => {
		const text = paragraph.getFirstChild();
		if ($isTextNode(text)) text.select(anchor, focus);
	};
}

describe("$insertTranscript", () => {
	it("inserts at the cursor with a space on the side that touches a word", () => {
		expect(
			insertInto(
				() => [$createTextNode("fix the bug")],
				"login",
				selectText(3, 3),
			),
		).toBe("fix login the bug");
	});

	it("pads after the transcript when the cursor is before a word", () => {
		expect(
			insertInto(() => [$createTextNode("world")], "hello", selectText(0, 0)),
		).toBe("hello world");
	});

	it("keeps a highlighted range and inserts after it", () => {
		expect(
			insertInto(
				() => [$createTextNode("fix the bug")],
				"login",
				selectText(7, 4),
			),
		).toBe("fix the login bug");
	});

	it("appends to the draft when the editor has no cursor", () => {
		expect(insertInto(() => [$createTextNode("draft")], " more words ")).toBe(
			"draft more words",
		);
	});

	it("separates the transcript from a chip before the cursor", () => {
		expect(
			insertInto(
				() => [
					MentionChipNode.fromChip({ label: "Linear", serialized: "@linear" }),
				],
				"triage this",
				(paragraph) => paragraph.selectEnd(),
			),
		).toBe("@linear triage this");
	});

	it("does nothing for a blank transcript", () => {
		expect(insertInto(() => [$createTextNode("draft")], "   ")).toBe("draft");
	});
});
