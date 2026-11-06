import { describe, expect, it } from "bun:test";
import type { ModifierEvent } from "../types";
import { buildPolicy } from "./policy";
import { PULL_REQUEST_LINKS } from "./pullRequestLinkPolicy";

const policy = buildPolicy(PULL_REQUEST_LINKS, "url", "4-tier");

function click(init: Partial<ModifierEvent> = {}): ModifierEvent {
	return { metaKey: false, ctrlKey: false, shiftKey: false, ...init };
}

describe("pull request link policy", () => {
	it("opens a plain click in the PR pane and shift-click in a new tab", () => {
		expect(policy.getAction(click())).toBe("pane");
		expect(policy.getAction(click({ shiftKey: true }))).toBe("newTab");
	});

	it("opens cmd/ctrl-click in the browser", () => {
		expect(policy.getAction(click({ metaKey: true }))).toBe("external");
		expect(policy.getAction(click({ ctrlKey: true }))).toBe("external");
		expect(policy.getAction(click({ metaKey: true, shiftKey: true }))).toBe(
			"external",
		);
	});
});
