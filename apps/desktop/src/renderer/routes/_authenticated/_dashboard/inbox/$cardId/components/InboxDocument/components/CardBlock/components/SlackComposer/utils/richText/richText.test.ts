import { describe, expect, test } from "bun:test";
import type { JSONContent } from "@tiptap/core";
import { docToRichText, richTextToMrkdwn } from "./richText";

const STANDARD: Record<string, string> = { pout: "😡", tada: "🎉" };
const emojiChar = (name: string) => STANDARD[name];
const doc = (...content: JSONContent[]) =>
	docToRichText({ type: "doc", content }, emojiChar);

const p = (...content: JSONContent[]): JSONContent => ({
	type: "paragraph",
	content,
});
const t = (text: string, marks: string[] = []): JSONContent => ({
	type: "text",
	text,
	...(marks.length ? { marks: marks.map((type) => ({ type })) } : {}),
});

describe("docToRichText", () => {
	test("lines of text join into one section with newlines", () => {
		const block = doc(p(t("hello")), p(t("world")));
		expect(block.elements).toEqual([
			{
				type: "rich_text_section",
				elements: [{ type: "text", text: "hello\nworld" }],
			},
		]);
		expect(richTextToMrkdwn(block)).toBe("hello\nworld");
	});

	test("a list after a line, nested items as an indented list", () => {
		const block = doc(p(t("todo")), {
			type: "bulletList",
			content: [
				{
					type: "listItem",
					content: [
						p(t("a")),
						{
							type: "orderedList",
							content: [{ type: "listItem", content: [p(t("a1"))] }],
						},
					],
				},
				{ type: "listItem", content: [p(t("b"))] },
			],
		});
		expect(
			block.elements.map((e) => [e.type, "indent" in e ? e.indent : null]),
		).toEqual([
			["rich_text_section", null],
			["rich_text_list", 0],
			["rich_text_list", 1],
			["rich_text_list", 0],
		]);
		expect(richTextToMrkdwn(block)).toBe("todo\n• a\n    1. a1\n• b");
	});

	test("standard emoji go out as their character, workspace emoji by name", () => {
		const block = doc(
			p(t("mad "), { type: "emoji", attrs: { name: "pout" } }, t(" ship "), {
				type: "emoji",
				attrs: { name: "shipit" },
			}),
		);
		expect(block.elements[0]).toEqual({
			type: "rich_text_section",
			elements: [
				{ type: "text", text: "mad 😡 ship " },
				{ type: "emoji", name: "shipit" },
			],
		});
		expect(richTextToMrkdwn(block)).toBe("mad 😡 ship :shipit:");
	});

	test("styles, mentions, channels and links", () => {
		const block = doc(
			p(
				t("bold", ["bold"]),
				t(" "),
				{
					type: "record-mention",
					attrs: { kind: "person", id: "U1", label: "Ann" },
				},
				t(" in "),
				{ type: "slackChannel", attrs: { id: "C1", label: "general" } },
				t(" "),
				{
					type: "text",
					text: "docs",
					marks: [{ type: "link", attrs: { href: "https://x.dev" } }],
				},
			),
		);
		expect(richTextToMrkdwn(block)).toBe(
			"*bold* <@U1> in <#C1> <https://x.dev|docs>",
		);
	});

	test("quotes and code blocks keep their own blocks; blank edges drop", () => {
		const block = doc(
			p(),
			{ type: "blockquote", content: [p(t("q1")), p(t("q2"))] },
			{ type: "codeBlock", content: [t("x < y")] },
			p(),
		);
		expect(block.elements.map((e) => e.type)).toEqual([
			"rich_text_quote",
			"rich_text_preformatted",
		]);
		expect(richTextToMrkdwn(block)).toBe("&gt; q1\n&gt; q2\n```x &lt; y```");
	});
});

describe("mentions that notify", () => {
	const notifying = (...content: JSONContent[]) =>
		docToRichText(
			{ type: "doc", content },
			emojiChar,
			new Map([["eng", "S0ENG"]]),
		);

	test("stay text where the card does not confirm them", () => {
		const block = doc(p(t("@channel and @eng")));
		expect(richTextToMrkdwn(block)).toBe("@channel and @eng");
	});

	test("@channel, @here, @everyone and a group's handle go out as mentions", () => {
		const block = notifying(p(t("@here and @eng: ship it, @everyone")));
		expect(block.elements).toEqual([
			{
				type: "rich_text_section",
				elements: [
					{ type: "broadcast", range: "here" },
					{ type: "text", text: " and " },
					{ type: "usergroup", usergroup_id: "S0ENG" },
					{ type: "text", text: ": ship it, " },
					{ type: "broadcast", range: "everyone" },
				],
			},
		]);
		expect(richTextToMrkdwn(block)).toBe(
			"<!here> and <!subteam^S0ENG>: ship it, <!everyone>",
		);
	});

	test("not inside a word, an address, code or a code block", () => {
		const block = notifying(
			p(t("a@here.dev @hereafter @@channel "), t("@channel", ["code"])),
			{ type: "codeBlock", content: [t("@everyone")] },
		);
		expect(JSON.stringify(block)).not.toContain("broadcast");
	});
});
