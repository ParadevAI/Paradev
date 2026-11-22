import { expect, test } from "bun:test";

// Lexical's packages import each other; under bun the markdown package has to
// load before @lexical/list or list's module sees an uninitialised binding.
test("keeps formatting, lists and mentions", async () => {
	const { $messageMarkdown, MESSAGE_SHORTCUTS } = await import(
		"./messageMarkdown"
	);
	const { $convertFromMarkdownString } = await import("@lexical/markdown");
	const { CodeNode } = await import("@lexical/code");
	const { LinkNode } = await import("@lexical/link");
	const { ListItemNode, ListNode } = await import("@lexical/list");
	const { QuoteNode } = await import("@lexical/rich-text");
	const { $createTextNode, $getRoot, createEditor } = await import("lexical");
	const { MentionChipNode } = await import(
		"../../../PromptInput/nodes/mentionChipNode"
	);

	const editor = createEditor({
		nodes: [
			MentionChipNode,
			ListNode,
			ListItemNode,
			QuoteNode,
			CodeNode,
			LinkNode,
		],
		onError: (error) => {
			throw error;
		},
	});
	editor.update(
		() => {
			$convertFromMarkdownString(
				"ship **today** \n- one\n- two\n> quoted",
				MESSAGE_SHORTCUTS,
				undefined,
				true,
			);
			const first = $getRoot().getFirstChild();
			first?.append(
				MentionChipNode.fromChip({ label: "Kiet Ho", serialized: "@Kiet Ho" }),
				$createTextNode(""),
			);
		},
		{ discrete: true },
	);
	const markdown = editor.getEditorState().read(() => $messageMarkdown());
	expect(markdown).toBe("ship **today** @Kiet Ho\n- one\n- two\n> quoted");
});

test("stored markdown round-trips through an edit unchanged", async () => {
	const { $messageMarkdown, MESSAGE_IMPORT } = await import(
		"./messageMarkdown"
	);
	const { $convertFromMarkdownString } = await import("@lexical/markdown");
	const { CodeNode } = await import("@lexical/code");
	const { LinkNode } = await import("@lexical/link");
	const { ListItemNode, ListNode } = await import("@lexical/list");
	const { QuoteNode } = await import("@lexical/rich-text");
	const { createEditor } = await import("lexical");
	const { MentionChipNode } = await import(
		"../../../PromptInput/nodes/mentionChipNode"
	);
	const roundTrip = (markdown: string) => {
		const editor = createEditor({
			nodes: [
				MentionChipNode,
				ListNode,
				ListItemNode,
				QuoteNode,
				CodeNode,
				LinkNode,
			],
			onError: (error) => {
				throw error;
			},
		});
		editor.update(
			() => {
				$convertFromMarkdownString(markdown, MESSAGE_IMPORT, undefined, true);
			},
			{ discrete: true },
		);
		return editor.getEditorState().read(() => $messageMarkdown());
	};
	expect(roundTrip("an *italic* word")).toBe("an *italic* word");
	expect(roundTrip("**bold**")).toBe("**bold**");
	expect(roundTrip("~~strike~~")).toBe("~~strike~~");
	expect(roundTrip("an _under_ word")).toBe("an *under* word");
});
