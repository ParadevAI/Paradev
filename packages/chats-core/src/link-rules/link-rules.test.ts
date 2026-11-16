import { describe, expect, test } from "bun:test";
import { linkChip } from "../link-chips/link-chips.ts";
import { discoverTaskLinks } from "../task-links/task-links.ts";
import { type LinkRule, resolveLink } from "./link-rules.ts";

/** What a plugin would bring as JSON: a Jira-like app, with no code. */
const JIRA: LinkRule = {
	app: "linear",
	hosts: ["*.atlassian.net"],
	patterns: [
		{ path: "/browse/:key", label: "{key|upper}" },
		{ path: "/wiki/spaces/:space/pages/:id/:title", label: "{title|words}" },
	],
	rewrites: [
		{ from: "jira://issue/:key", to: "https://acme.atlassian.net/browse/:key" },
	],
};

describe("resolveLink", () => {
	test("matches hosts exactly, or with subdomains for *.host, ignoring www", () => {
		expect(
			resolveLink("https://acme.atlassian.net/browse/ab-12", [JIRA]),
		).toEqual({
			app: "linear",
			url: "https://acme.atlassian.net/browse/ab-12",
			label: "AB-12",
		});
		expect(
			resolveLink("https://atlassian.net/browse/ab-12", [JIRA])?.label,
		).toBe("AB-12");
		expect(
			resolveLink("https://notatlassian.net/browse/ab-12", [JIRA]),
		).toBeNull();
		expect(resolveLink("mailto:a@b.c", [JIRA])).toBeNull();
	});

	test("a pattern must fit the whole path, and one that names nothing falls through", () => {
		expect(
			resolveLink("https://acme.atlassian.net/browse/ab-12/extra", [JIRA])
				?.label,
		).toBeNull();
		expect(
			resolveLink(
				"https://acme.atlassian.net/wiki/spaces/ENG/pages/9/launch-plan",
				[JIRA],
			)?.label,
		).toBe("Launch plan");
		const rule: LinkRule = {
			app: "linear",
			hosts: ["x.com"],
			patterns: [
				{ path: "/:a", label: ({ a }) => (a === "no" ? null : "first") },
				{ path: "/:a", label: "second" },
			],
		};
		expect(resolveLink("https://x.com/no", [rule])?.label).toBe("second");
	});

	test("a captured value in `not` skips the pattern", () => {
		const rule: LinkRule = {
			app: "github",
			hosts: ["x.com"],
			patterns: [
				{ path: "/:owner", label: "{owner}", not: { owner: ["Settings"] } },
			],
		};
		expect(resolveLink("https://x.com/settings", [rule])?.label).toBeNull();
		expect(resolveLink("https://x.com/nina", [rule])?.label).toBe("nina");
	});

	test("rewrites another spelling to the web address", () => {
		expect(resolveLink("jira://issue/ab-12", [JIRA])).toMatchObject({
			url: "https://acme.atlassian.net/browse/ab-12",
			label: "AB-12",
		});
	});
});

describe("a plugin's rules reach chips and task links", () => {
	test("linkChip names its address, with the app's mark", () => {
		expect(
			linkChip("https://acme.atlassian.net/browse/ab-12", [JIRA]),
		).toMatchObject({ app: "linear", label: "AB-12" });
		expect(linkChip("https://acme.atlassian.net/browse/ab-12")).toBeNull();
	});

	test("discoverTaskLinks finds them next to the built-in ones, in order", () => {
		const rules = [JIRA];
		const text =
			"see jira://issue/ab-1 then https://acme.atlassian.net/browse/ab-2 and https://example.com";
		expect(discoverTaskLinks(text, rules)).toEqual([
			"https://acme.atlassian.net/browse/ab-1",
			"https://acme.atlassian.net/browse/ab-2",
		]);
	});
});
