import { expect, test } from "bun:test";
import { remarkMentions } from "./remarkMentions";

test("links mentioned names, longest first, and leaves code alone", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "paragraph",
				children: [
					{ type: "text", value: "hi @Avi Peltz and @Avi, @Bob" },
					{ type: "inlineCode", value: "@Avi" },
				],
			},
		],
	};
	remarkMentions([
		{ id: "a1", name: "Avi" },
		{ id: "a2", name: "Avi Peltz" },
	])()(tree);
	expect(tree.children[0]?.children as unknown[]).toEqual([
		{ type: "text", value: "hi " },
		{
			type: "link",
			url: "#mention-a2",
			children: [{ type: "text", value: "@Avi Peltz" }],
		},
		{ type: "text", value: " and " },
		{
			type: "link",
			url: "#mention-a1",
			children: [{ type: "text", value: "@Avi" }],
		},
		{ type: "text", value: ", @Bob" },
		{ type: "inlineCode", value: "@Avi" },
	]);
});
