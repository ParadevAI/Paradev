import { expect, test } from "bun:test";
import {
	pullRequestDisplayState,
	showsChecks,
} from "./pullRequestDisplayState";

test("a draft reads as a draft only while it is open", () => {
	expect(pullRequestDisplayState({ state: "open", isDraft: true })).toBe(
		"draft",
	);
	expect(pullRequestDisplayState({ state: "closed", isDraft: true })).toBe(
		"closed",
	);
	expect(pullRequestDisplayState({ state: "merged", isDraft: false })).toBe(
		"merged",
	);
	expect(showsChecks("draft")).toBe(true);
	expect(showsChecks("merged")).toBe(false);
});
