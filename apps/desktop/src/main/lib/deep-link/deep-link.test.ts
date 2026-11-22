import { describe, expect, test } from "bun:test";
import {
	deepLinkToRoute,
	findDeepLinkInArgv,
	isDeepLinkUrl,
} from "./deep-link";

describe("isDeepLinkUrl", () => {
	test("accepts superset:// and paradev://", () => {
		expect(isDeepLinkUrl("superset://tasks/a")).toBe(true);
		expect(isDeepLinkUrl("paradev://tasks/a")).toBe(true);
		expect(isDeepLinkUrl("PARADEV://tasks/a")).toBe(true);
	});

	test("rejects other schemes and look-alike prefixes", () => {
		expect(isDeepLinkUrl("https://paradev.com")).toBe(false);
		expect(isDeepLinkUrl("paradevx://tasks/a")).toBe(false);
		expect(isDeepLinkUrl("C:\\Program Files\\Paradev")).toBe(false);
		expect(isDeepLinkUrl("superset-other://tasks/a", ["superset"])).toBe(false);
	});
});

describe("findDeepLinkInArgv", () => {
	test("finds a link of either scheme among other args", () => {
		const exec = ["/usr/bin/superset", "--no-sandbox"];
		expect(findDeepLinkInArgv([...exec, "superset://tasks/a"])).toBe(
			"superset://tasks/a",
		);
		expect(findDeepLinkInArgv([...exec, "paradev://tasks/a"])).toBe(
			"paradev://tasks/a",
		);
		expect(findDeepLinkInArgv([...exec, "--new-window"])).toBeUndefined();
	});
});

describe("deepLinkToRoute", () => {
	test("maps the link path to a route for both schemes", () => {
		expect(deepLinkToRoute("superset://tasks/my-slug")).toBe("/tasks/my-slug");
		expect(deepLinkToRoute("paradev://tasks/my-slug?x=1")).toBe(
			"/tasks/my-slug?x=1",
		);
	});

	test("rewrites the old v2-workspace route for both schemes", () => {
		expect(deepLinkToRoute("superset://v2-workspace/abc")).toBe(
			"/workspace/abc",
		);
		expect(deepLinkToRoute("paradev://v2-workspaces")).toBe("/workspaces");
		expect(deepLinkToRoute("paradev://v2-workspacex/abc")).toBe(
			"/v2-workspacex/abc",
		);
	});
});
