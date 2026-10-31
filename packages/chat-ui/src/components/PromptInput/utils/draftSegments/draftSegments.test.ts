import { describe, expect, test } from "bun:test";
import {
	$createParagraphNode,
	$createTextNode,
	$getRoot,
	createEditor,
	type LexicalEditor,
} from "lexical";
import { COMPOSER_NODES } from "../../constants";
import { MentionChipNode } from "../../nodes/mentionChipNode";
import type { ComposerDraftSegment } from "../../types";
import {
	$appendDraftSegments,
	$readPromptText,
	draftChips,
	draftOf,
	draftText,
} from "./draftSegments";

const chip = { label: "Linear", serialized: "@linear", data: { id: 7 } };

function newEditor(): LexicalEditor {
	return createEditor({
		nodes: COMPOSER_NODES,
		onError: (error) => {
			throw error;
		},
	});
}

function load(editor: LexicalEditor, update: () => void) {
	editor.update(update, { discrete: true });
	return {
		draft: draftOf(editor.getEditorState()),
		prompt: editor.getEditorState().read($readPromptText),
		text: editor.getEditorState().read(() => $getRoot().getTextContent()),
	};
}

const append = (...drafts: ComposerDraftSegment[][]) =>
	load(newEditor(), () => {
		for (const draft of drafts) $appendDraftSegments(draft);
	});

describe("draft segments", () => {
	test("a chip seed loads inline, ready to type after", () => {
		const { prompt, draft, text } = append([{ type: "chip", chip }]);
		expect(prompt).toBe("@linear");
		expect(text).toBe("@linear ");
		expect(draftChips(draft)).toEqual([chip]);
	});

	test("markdown lists, formats and code load as blocks", () => {
		const markdown =
			"Plan:\n- read **the** issue\n    - then *fix* it\n1. ship\n> careful\n```\nconst a = 1;\n```";
		const { prompt, text } = append([{ type: "text", text: markdown }]);
		expect(prompt).toBe(markdown);
		expect(text).not.toContain("- read");
	});

	test("pasted headings and links go to the agent as markdown", () => {
		const markdown =
			"## Install\nRead [the docs](https://example.com/docs) first.";
		const { prompt, text } = append([{ type: "text", text: markdown }]);
		expect(prompt).toBe(markdown);
		expect(text).not.toContain("](");
	});

	test("prompt text that only looks like markdown is sent as typed", () => {
		const typed = "call __init__ with *args, ~/src/a_b.py and &#60; &#9999999;";
		const { prompt, text } = append([{ type: "text", text: typed }]);
		expect(prompt).toBe(typed);
		expect(text).toBe(typed);
	});

	test("the composer's draft reloads exactly, formatting included", () => {
		const first = load(newEditor(), () => {
			const paragraph = $createParagraphNode().append(
				$createTextNode("é"),
				$createTextNode("x ").toggleFormat("italic"),
				$createTextNode("y"),
				MentionChipNode.fromChip(chip),
			);
			$getRoot().clear().append(paragraph);
		});
		const second = append(first.draft);
		expect(second.draft).toEqual(first.draft);
		expect(first.prompt).toBe("é*x* y@linear");
		expect(draftChips(first.draft)).toEqual([chip]);
	});

	test("formatted edge spaces go outside the markers", () => {
		const { prompt } = load(newEditor(), () => {
			$getRoot()
				.clear()
				.append(
					$createParagraphNode().append(
						$createTextNode("word ").toggleFormat("bold"),
						$createTextNode("next"),
						$createTextNode(" ").toggleFormat("italic"),
						$createTextNode("end"),
					),
				);
		});
		expect(prompt).toBe("**word** next end");
	});

	test("formatted whitespace next to the same format keeps its markers balanced", () => {
		const prompt = (...parts: [string, boolean][]) =>
			load(newEditor(), () => {
				const nodes = parts.map(([text, bold]) => {
					const node = $createTextNode(text);
					return bold ? node.toggleFormat("bold") : node;
				});
				$getRoot()
					.clear()
					.append($createParagraphNode().append(...nodes));
			}).prompt;
		expect(prompt(["a", true], [" ", true], ["b", false])).toBe("**a** b");
		expect(prompt(["a", false], [" ", true], ["b", true])).toBe("a **b**");
		expect(prompt(["a", true], [" ", true], ["b", true])).toBe("**a b**");
	});

	test("the prompt drops empty bullets and blank lines at its ends", () => {
		expect(append([{ type: "text", text: "-" }]).prompt).toBe("");
		expect(
			append([{ type: "text", text: "\n- a\n- b\n- \n1. \n>" }]).prompt,
		).toBe("- a\n- b");
	});

	test("appending keeps the existing content first", () => {
		const editor = newEditor();
		load(editor, () => $appendDraftSegments([{ type: "text", text: "- one" }]));
		const draft = draftOf(editor.getEditorState());
		const { prompt } = append(draft, [{ type: "text", text: "two" }]);
		expect(prompt).toBe("- one\n\ntwo");
	});

	test("a saved state this build cannot read is not loaded", () => {
		const unknown = {
			type: "editor",
			state: {
				root: {
					type: "root",
					children: [{ type: "from-a-newer-build", version: 1 }],
				},
			},
			text: "- kept",
		} as unknown as ComposerDraftSegment;
		const broken = { type: "editor" } as unknown as ComposerDraftSegment;
		expect(append([unknown]).prompt).toBe("");
		expect(append([broken]).prompt).toBe("");
		expect(draftChips([broken])).toEqual([]);
	});

	test("an empty editor has no draft", () => {
		expect(append([]).draft).toEqual([]);
		expect(append([{ type: "text", text: "- " }]).draft).toEqual([]);
	});

	test("draft text reads every kind of segment", () => {
		const { draft } = append([{ type: "text", text: "- a" }]);
		expect(draftText([{ type: "chip", chip }, ...draft])).toBe(
			"@linear \n\n- a",
		);
		expect(draftText([...draft, { type: "text", text: "b" }])).toBe("- a\n\nb");
	});
});
