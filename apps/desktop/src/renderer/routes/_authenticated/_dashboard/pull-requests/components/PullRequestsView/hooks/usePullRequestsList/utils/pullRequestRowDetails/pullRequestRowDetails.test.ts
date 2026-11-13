import { describe, expect, test } from "bun:test";
import {
	applyPullRequestRowDetails,
	carryOverPullRequestRowDetails,
	pullRequestNumbersByProject,
	pullRequestRowKey,
} from "./pullRequestRowDetails";

function row(projectId: string, prNumber: number) {
	return {
		projectId,
		prNumber,
		title: `#${prNumber}`,
		checks: [] as { name: string }[],
		checksStatus: "none",
		additions: null as number | null,
		deletions: null as number | null,
		headRefName: null as string | null,
		detailsPending: true,
		detailsCarried: false,
	};
}

const ciDetails = {
	checks: [{ name: "CI" }],
	checksStatus: "success",
	additions: 3,
	deletions: 1,
	headRefName: "fix",
};

describe("applyPullRequestRowDetails", () => {
	test("matches on project and number, since repos reuse PR numbers", () => {
		const page = {
			page: 1,
			pullRequests: [row("a", 7), row("b", 7), row("b", 8)],
		};
		const next = applyPullRequestRowDetails(page, [
			{ projectId: "b", prNumber: 7, ...ciDetails },
		]);
		expect(next.page).toBe(1);
		expect(next.pullRequests[0]).toEqual(row("a", 7));
		expect(next.pullRequests[1]).toEqual({
			...row("b", 7),
			...ciDetails,
			detailsPending: false,
		});
		expect(next.pullRequests[2]).toEqual(row("b", 8));
	});
});

describe("carryOverPullRequestRowDetails", () => {
	test("shows the previous details but leaves them pending until fresh ones land", () => {
		const confirmed = { ...row("a", 7), ...ciDetails, detailsPending: false };
		const neverFilled = row("a", 8);
		const next = carryOverPullRequestRowDetails(
			{ pullRequests: [row("a", 7), row("a", 8)] },
			[confirmed, neverFilled],
		);
		expect(next.pullRequests[0]).toEqual({
			...row("a", 7),
			...ciDetails,
			detailsPending: true,
			detailsCarried: true,
		});
		expect(next.pullRequests[1]).toEqual(row("a", 8));
	});
});

describe("pullRequestNumbersByProject", () => {
	test("groups a multi-repo project's numbers per repository", () => {
		expect(
			pullRequestNumbersByProject([
				{ ...row("a", 3), repositoryId: "web" },
				{ ...row("a", 3), repositoryId: "api" },
				{ ...row("a", 5), repositoryId: "web" },
			]),
		).toEqual([
			{ projectId: "a", repositoryId: "web", prNumbers: [3, 5] },
			{ projectId: "a", repositoryId: "api", prNumbers: [3] },
		]);
	});

	test("groups numbers per project in row order", () => {
		expect(
			pullRequestNumbersByProject([row("a", 3), row("b", 9), row("a", 1)]),
		).toEqual([
			{ projectId: "a", prNumbers: [3, 1] },
			{ projectId: "b", prNumbers: [9] },
		]);
	});
});

describe("rows of a multi-repo project", () => {
	const api = { ...row("orbit", 1), repositoryId: "api" };
	const web = { ...row("orbit", 1), repositoryId: "web" };

	test("are told apart by repository", () => {
		expect(pullRequestRowKey(api)).not.toBe(pullRequestRowKey(web));
		const filledWeb: typeof web = {
			...web,
			...ciDetails,
			detailsPending: false,
		};
		const next = carryOverPullRequestRowDetails({ pullRequests: [api, web] }, [
			filledWeb,
		]);
		expect(next.pullRequests[0]).toEqual(api);
		expect(next.pullRequests[1]).toEqual({
			...web,
			...ciDetails,
			detailsPending: true,
			detailsCarried: true,
		});
	});

	test("take no host detail that cannot name their repository", () => {
		const next = applyPullRequestRowDetails({ pullRequests: [api, web] }, [
			{ projectId: "orbit", prNumber: 1, ...ciDetails },
		]);
		expect(next.pullRequests).toEqual([api, web]);
	});

	test("a one-repository row takes the host's detail for its project", () => {
		const only = { ...row("solo", 2), repositoryId: "solo-repo" };
		const next = applyPullRequestRowDetails({ pullRequests: [only] }, [
			{ projectId: "solo", prNumber: 2, ...ciDetails },
		]);
		expect(next.pullRequests[0]).toEqual({
			...only,
			...ciDetails,
			detailsPending: false,
		});
	});
});
