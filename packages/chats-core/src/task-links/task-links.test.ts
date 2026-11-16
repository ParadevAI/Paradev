import { describe, expect, test } from "bun:test";
import { discoverTaskLinks, mergeTaskLinks } from "./task-links.ts";

const WS = "700b5fb0-f0f2-4c14-af83-ab629befd08a";

describe("discoverTaskLinks", () => {
	test("keeps links into known apps, in order, once each, without trailing punctuation", () => {
		const text = `See https://linear.app/acme/issue/super-1/x, then [the page](https://www.notion.so/acme/Plan-0123456789abcdef0123456789abcdef). https://linear.app/acme/issue/super-1/x again. https://example.com/nope`;
		expect(discoverTaskLinks(text)).toEqual([
			"https://linear.app/acme/issue/super-1/x",
			"https://www.notion.so/acme/Plan-0123456789abcdef0123456789abcdef",
		]);
	});

	test("turns a Superset desktop workspace address into its web one", () => {
		expect(
			discoverTaskLinks(`running in superset://v2-workspace/${WS} now`),
		).toEqual([`https://app.superset.sh/workspaces/${WS}`]);
		expect(
			discoverTaskLinks(
				`https://app.superset.sh/workspaces/${WS} and superset://v2-workspace/${WS}`,
			),
		).toEqual([`https://app.superset.sh/workspaces/${WS}`]);
	});

	test("keeps an address inside another's query whole, and ignores a desktop address inside another address", () => {
		expect(
			discoverTaskLinks(
				"https://sentry.io/auth/login/?next=https://acme.sentry.io/issues/1/",
			),
		).toEqual([
			"https://sentry.io/auth/login/?next=https://acme.sentry.io/issues/1/",
		]);
		expect(
			discoverTaskLinks(`https://example.com/?u=superset://v2-workspace/${WS}`),
		).toEqual([]);
		expect(discoverTaskLinks(`(superset://v2-workspace/${WS})`)).toEqual([
			`https://app.superset.sh/workspaces/${WS}`,
		]);
	});

	test("finds none in plain words", () => {
		expect(discoverTaskLinks("nothing here, see example.com")).toEqual([]);
	});
});

describe("mergeTaskLinks", () => {
	test("adds the new after the saved, once", () => {
		expect(mergeTaskLinks(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
	});
});
