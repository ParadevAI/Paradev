import { expect, test } from "bun:test";
import type {
	PRFlowState,
	PullRequest,
} from "../../../../utils/getPRFlowState";
import { menuCurrentPullRequest } from "./menuCurrentPullRequest";

const cachedPr = { number: 7 } as PullRequest;
const prExists: PRFlowState = { kind: "pr-exists", pr: cachedPr, sync: null };

test("a single-repo menu shows the primary's pull request", () => {
	expect(menuCurrentPullRequest(prExists, false)).toBe(cachedPr);
	expect(menuCurrentPullRequest({ kind: "busy", pr: cachedPr }, false)).toBe(
		cachedPr,
	);
});

test("a multi-repo menu ignores a pull request cached for the primary", () => {
	expect(menuCurrentPullRequest(prExists, true)).toBeNull();
	expect(
		menuCurrentPullRequest(
			{ kind: "error", pr: cachedPr, message: "failed" },
			true,
		),
	).toBeNull();
});
