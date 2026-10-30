import { describe, expect, test } from "bun:test";
import type { GitHubCheckContextNode } from "../github-query";
import {
	coercePullRequestState,
	mapPullRequestState,
	parseCheckContexts,
} from "./pull-request-mappers";

describe("mapPullRequestState", () => {
	test("maps merged and closed states regardless of other flags", () => {
		expect(mapPullRequestState("MERGED", false, true)).toBe("merged");
		expect(mapPullRequestState("CLOSED", true, true)).toBe("closed");
	});

	test("draft trumps merge-queue membership", () => {
		expect(mapPullRequestState("OPEN", true, true)).toBe("draft");
	});

	test("an open PR in the merge queue is queued", () => {
		expect(mapPullRequestState("OPEN", false, true)).toBe("queued");
	});

	test("an open PR not in the queue stays open", () => {
		expect(mapPullRequestState("OPEN", false, false)).toBe("open");
		expect(mapPullRequestState("OPEN", false)).toBe("open");
	});
});

describe("coercePullRequestState", () => {
	test("round-trips the queued state", () => {
		expect(coercePullRequestState("queued")).toBe("queued");
	});

	test("falls back to open for unknown values", () => {
		expect(coercePullRequestState("nonsense")).toBe("open");
		expect(coercePullRequestState(null)).toBe("open");
	});
});

function checkRun(conclusion: string | null): GitHubCheckContextNode {
	return {
		__typename: "CheckRun",
		name: "build",
		conclusion,
		detailsUrl: null,
		status: "COMPLETED",
		startedAt: null,
		completedAt: null,
		checkSuite: null,
	};
}

describe("parseCheckContexts", () => {
	test("a completed run that failed to start is a failure", () => {
		expect(parseCheckContexts([checkRun("STARTUP_FAILURE")])).toEqual([
			{ name: "build", status: "failure", url: null },
		]);
	});
});
