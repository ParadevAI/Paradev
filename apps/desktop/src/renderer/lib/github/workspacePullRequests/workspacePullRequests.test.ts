import { describe, expect, test } from "bun:test";
import {
	type WorkspacePullRequestSummary,
	workspacePullRequests,
} from "./workspacePullRequests";

const pr = (number: number, repo = "app"): WorkspacePullRequestSummary => ({
	number,
	title: `PR ${number}`,
	state: "open",
	url: `https://github.com/acme/${repo}/pull/${number}`,
});

describe("workspacePullRequests", () => {
	test("falls back to the current PR on an older host", () => {
		expect(workspacePullRequests(pr(1), undefined)).toEqual([pr(1)]);
	});
	test("keeps current first and deduplicates by repository URL, not number", () => {
		expect(
			workspacePullRequests(pr(2), [pr(1), pr(2), pr(1, "other")]),
		).toEqual([pr(2), pr(1), pr(1, "other")]);
	});
	test("retains history when there is no current link", () => {
		expect(workspacePullRequests(null, [pr(1)])).toEqual([pr(1)]);
		expect(workspacePullRequests(null, undefined)).toEqual([]);
	});
});
