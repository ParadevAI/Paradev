import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import {
	appLinksToLinks,
	bareUrlsToLinks,
	isMessageLink,
	linkChipsToLinks,
	linkTarget,
	mentionsToLinks,
	messageMarkdown,
	splitAppLines,
	splitLinkChips,
} from "./message-links.ts";

const ID = "11111111-0000-4000-8000-000000000000";
const APP = "57c3cb11-d29f-4b2a-9165-3433a5727a5e";
const URL = `https://${APP}.devusercontent.com/_v/2/`;

describe("mentions as links", () => {
	test("tokens become links that round-trip to the mention; brackets in names are escaped", () => {
		const md = mentionsToLinks(`ask <@dev:${ID}> **now**`, () => "Juni [per]");
		expect(md).toBe(`ask [@Juni \\[per\\]](dev-mention:dev/${ID}) **now**`);
		expect(linkTarget(`dev-mention:dev/${ID}`)).toEqual({
			kind: "mention",
			ref: { kind: "dev", id: ID },
		});
		expect(linkTarget("https://example.com")).toEqual({
			kind: "url",
			url: "https://example.com",
		});
	});

	test("emoji next to mentions stay whole", () => {
		expect(
			mentionsToLinks(`👋<@dev:${ID}>👍🏽 hi 👨‍👩‍👧`, () => "Juniper"),
		).toBe(`👋[@Juniper](dev-mention:dev/${ID})👍🏽 hi 👨‍👩‍👧`);
	});
});

describe("app addresses as links", () => {
	test("bare, autolinked and markdown-linked addresses all become the app's name", () => {
		const md = appLinksToLinks(
			`Open ${URL}. Or [here](${URL}) or <${URL}>`,
			() => "Gym Log",
		);
		expect(md).toBe(
			`Open [Gym Log](dev-app:${APP}). Or [Gym Log](dev-app:${APP}) or [Gym Log](dev-app:${APP})`,
		);
		expect(linkTarget(`dev-app:${APP}`)).toEqual({
			kind: "app",
			appId: APP,
		});
		expect(isMessageLink(`dev-app:${APP}`)).toBe(true);
		expect(isMessageLink("javascript:alert(1)")).toBe(false);
	});

	test("a message's markdown names mentions and apps from the state; an unknown app is App", () => {
		const state: ChatState = {
			meId: "u1",
			members: { u1: { id: "u1", name: "Alex" } },
			devs: {
				[ID]: {
					id: ID,
					kind: "group",
					name: "Spotter",
					color: "#000000",
					ownerId: null,
					description: "",
				},
			},
			chats: [
				{
					id: "g",
					title: "Gym",
					kind: "group",
					memberIds: ["u1"],
					ownerIds: ["u1"],
					devIds: [ID],
				},
			],
			messages: [],
			tasks: [],
			apps: [
				{
					id: APP,
					chatId: "g",
					name: "Gym Log",
					description: "",
					color: 1,
					status: "live",
					version: null,
					url: URL,
					creatorDevId: null,
					saved: true,
					createdAt: "",
				},
			],
		};
		expect(
			messageMarkdown(state, state.chats[0], `**<@dev:${ID}>** built ${URL}`),
		).toBe(
			`**[@Spotter](dev-mention:dev/${ID})** built [Gym Log](dev-app:${APP})`,
		);
		expect(messageMarkdown({ ...state, apps: [] }, state.chats[0], URL)).toBe(
			`[Sketch](dev-app:${APP})`,
		);
		expect(
			messageMarkdown(
				state,
				state.chats[0],
				"on https://github.com/a/b/pull/2.",
			),
		).toBe("on [a/b#2](https://github.com/a/b/pull/2).");
	});
});

describe("splitAppLines", () => {
	test("a line that is only an app's address stands alone; one inside a sentence stays", () => {
		expect(
			splitAppLines(`Done, it's in the tab.\n\n${URL}\nMore: see ${URL} now`),
		).toEqual([
			{ type: "markdown", text: "Done, it's in the tab.\n" },
			{ type: "app", appId: APP },
			{ type: "markdown", text: `More: see ${URL} now` },
		]);
		expect(splitAppLines(`  <${URL}>  `)).toEqual([
			{ type: "app", appId: APP },
		]);
		expect(splitAppLines("plain")).toEqual([
			{ type: "markdown", text: "plain" },
		]);
	});
});

describe("bare addresses", () => {
	test("end where the address does, not with the sentence's punctuation", () => {
		expect(
			bareUrlsToLinks(
				"anyone with this link can talk to you now: https://api.dev.sh/m/XoGini-elHMS. Add that",
			),
		).toBe(
			"anyone with this link can talk to you now: <https://api.dev.sh/m/XoGini-elHMS>. Add that",
		);
		expect(bareUrlsToLinks("see https://a.b/c, then https://a.b/d!")).toBe(
			"see <https://a.b/c>, then <https://a.b/d>!",
		);
		expect(bareUrlsToLinks("(at https://a.b/c)")).toBe("(at <https://a.b/c>)");
		expect(bareUrlsToLinks("https://en.wikipedia.org/wiki/Foo_(bar).")).toBe(
			"<https://en.wikipedia.org/wiki/Foo_(bar)>.",
		);
		expect(bareUrlsToLinks("https://a.b/x?y=1&z=2")).toBe(
			"<https://a.b/x?y=1&z=2>",
		);
	});

	test("leave links, autolinks and code as written", () => {
		const written =
			"[docs](https://a.b/c). <https://a.b/d>. `curl https://a.b/e.` and\n```\nhttps://a.b/f.\n```";
		expect(bareUrlsToLinks(written)).toBe(written);
	});
});

describe("linkChipsToLinks", () => {
	const issue = "https://linear.app/acme/issue/SUPER-1/x";
	test("autolinks to known apps take their name; others and code stay", () => {
		expect(linkChipsToLinks(`see <${issue}> and <https://example.com>`)).toBe(
			`see [SUPER-1](${issue}) and <https://example.com>`,
		);
		expect(linkChipsToLinks(`\`<${issue}>\``)).toBe(`\`<${issue}>\``);
		expect(linkChipsToLinks(`~~~\n<${issue}>\n~~~`)).toBe(
			`~~~\n<${issue}>\n~~~`,
		);
	});

	test("a label reads as itself, never as emphasis or code", () => {
		const file = "https://github.com/a/b/blob/main/pkg/__init__.py";
		expect(linkChipsToLinks(`<${file}>`)).toBe(
			`[\\_\\_init\\_\\_.py](${file})`,
		);
	});
});

describe("splitLinkChips", () => {
	test("splits at known apps' addresses, bare or <…>, ending them as bareUrlsToLinks does", () => {
		expect(
			splitLinkChips(
				"look at https://github.com/a/b/pull/1. And https://example.com",
			),
		).toEqual([
			{ type: "text", text: "look at " },
			{ type: "link", href: "https://github.com/a/b/pull/1" },
			{ type: "text", text: ". And https://example.com" },
		]);
		expect(splitLinkChips("x<https://github.com/a/b/pull/1>abc")).toEqual([
			{ type: "text", text: "x" },
			{ type: "link", href: "https://github.com/a/b/pull/1" },
			{ type: "text", text: "abc" },
		]);
		expect(splitLinkChips("notes: https://www.notion.so/Foo-(bar).")).toEqual([
			{ type: "text", text: "notes: " },
			{ type: "link", href: "https://www.notion.so/Foo-(bar)" },
			{ type: "text", text: "." },
		]);
	});

	test("code stays text", () => {
		expect(splitLinkChips("`https://github.com/a/b`")).toEqual([
			{ type: "text", text: "`https://github.com/a/b`" },
		]);
	});
});
