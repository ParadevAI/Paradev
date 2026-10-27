import { expect, test } from "bun:test";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { remarkChannelRefs, remarkMentions } from "./remarkMentions";

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
	remarkMentions({
		people: [
			{ id: "a1", name: "Avi" },
			{ id: "a2", name: "Avi Peltz" },
		],
	})(tree);
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

test("links channel names but not longer words that start with one", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "paragraph",
				children: [{ type: "text", value: "see #roster, not #roster-old" }],
			},
		],
	};
	remarkChannelRefs({ channels: [{ id: "c1", name: "roster" }] })(tree);
	expect(tree.children[0]?.children as unknown[]).toEqual([
		{ type: "text", value: "see " },
		{
			type: "link",
			url: "#channel-c1",
			children: [{ type: "text", value: "#roster" }],
		},
		{ type: "text", value: ", not #roster-old" },
	]);
});

test("each message links its own names through ChatMarkdown's processor cache", () => {
	const render = (
		body: string,
		plugins: NonNullable<ComponentProps<typeof ChatMarkdown>["remarkPlugins"]>,
	) =>
		renderToString(<ChatMarkdown remarkPlugins={plugins}>{body}</ChatMarkdown>);
	expect(
		render("@Avi hi", [
			[remarkMentions, { people: [{ id: "a1", name: "Avi" }] }],
		]),
	).toContain('href="#mention-a1"');
	expect(
		render("@Kiet hi", [
			[remarkMentions, { people: [{ id: "k1", name: "Kiet" }] }],
		]),
	).toContain('href="#mention-k1"');
	expect(
		render("#cloud hi", [
			[remarkChannelRefs, { channels: [{ id: "c1", name: "cloud" }] }],
		]),
	).toContain('href="#channel-c1"');
});
