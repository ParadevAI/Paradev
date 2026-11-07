import { describe, expect, test } from "bun:test";
import { PullRequestReadError } from "../pull-request-detail";
import { githubErrorCode, pullRequestOnGithub } from "./pull-request-github";

function recordingClient(responses: Record<string, unknown> = {}) {
	const calls: [string, unknown][] = [];
	return {
		calls,
		client: {
			graphql: async <T>(query: string, variables: Record<string, unknown>) => {
				calls.push([
					query.includes("pullRequest(number") ? "node-id" : "graphql",
					variables,
				]);
				return { repository: { pullRequest: { id: "PR_node" } } } as T;
			},
			request: async (route: string, parameters?: Record<string, unknown>) => {
				calls.push([route, parameters]);
				return { data: responses[route] ?? {} };
			},
		},
	};
}

const pr = { owner: "acme", repo: "widgets", number: 7 };

describe("pullRequestOnGithub", () => {
	test("writes go to GitHub's own endpoints for the one pull request", async () => {
		const { client, calls } = recordingClient({
			"POST /repos/{owner}/{repo}/issues/{issue_number}/comments": {
				id: 1,
				html_url: "https://github.com/acme/widgets/pull/7#issuecomment-1",
			},
		});
		const github = pullRequestOnGithub(client, pr);
		expect(await github.comment("hi")).toEqual({
			id: 1,
			url: "https://github.com/acme/widgets/pull/7#issuecomment-1",
		});
		await github.merge({ mergeMethod: "squash" });
		await github.setState("closed");
		await github.setDraft(true);
		await github.diffstat();
		expect(calls).toEqual([
			[
				"POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
				{ owner: "acme", repo: "widgets", issue_number: 7, body: "hi" },
			],
			[
				"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge",
				{
					owner: "acme",
					repo: "widgets",
					pull_number: 7,
					merge_method: "squash",
				},
			],
			[
				"PATCH /repos/{owner}/{repo}/pulls/{pull_number}",
				{ owner: "acme", repo: "widgets", pull_number: 7, state: "closed" },
			],
			["node-id", { owner: "acme", name: "widgets", number: 7 }],
			["graphql", { id: "PR_node" }],
			[
				"GET /repos/{owner}/{repo}/pulls/{pull_number}",
				{ owner: "acme", repo: "widgets", pull_number: 7 },
			],
		]);
	});

	test("a failed threads read is reported, not mistaken for no comments, and its cause is handed back", async () => {
		const github = pullRequestOnGithub(
			{
				graphql: async () => {
					throw new Error("rate limited");
				},
				request: async () => ({ data: {} }),
			},
			pr,
		);
		const causes: unknown[] = [];
		expect(await github.threads((error) => causes.push(error))).toEqual({
			reviewThreads: [],
			conversationComments: [],
			fetchFailed: true,
		});
		expect(causes.map(String)).toEqual(["Error: rate limited"]);
	});
});

test("GitHub's answers map to the codes clients branch on", () => {
	expect(githubErrorCode({ status: 405 })).toBe("CONFLICT");
	expect(githubErrorCode({ status: 404 })).toBe("NOT_FOUND");
	expect(githubErrorCode({ errors: [{ type: "FORBIDDEN" }] })).toBe(
		"FORBIDDEN",
	);
	expect(githubErrorCode({ errors: [{ message: "already a draft" }] })).toBe(
		"BAD_REQUEST",
	);
	expect(githubErrorCode(new PullRequestReadError("NOT_FOUND", "gone"))).toBe(
		"NOT_FOUND",
	);
	expect(githubErrorCode(new Error("boom"))).toBe("INTERNAL_SERVER_ERROR");
});

test("threads come back with the conversation, minus empty comments", async () => {
	const github = pullRequestOnGithub(
		{
			graphql: async <T>() =>
				({
					repository: {
						pullRequest: {
							reviewThreads: { nodes: [] },
							comments: {
								nodes: [
									{
										databaseId: 9,
										body: " LGTM ",
										createdAt: "2026-10-01T00:00:00Z",
										url: "https://github.com/acme/widgets/pull/7#issuecomment-9",
										author: { login: "maya", avatarUrl: "a" },
									},
									{
										databaseId: 10,
										body: "  ",
										createdAt: "x",
										url: "y",
										author: null,
									},
									null,
								],
							},
						},
					},
				}) as T,
			request: async () => ({ data: {} }),
		},
		pr,
	);
	expect(await github.threads()).toEqual({
		reviewThreads: [],
		conversationComments: [
			{
				id: 9,
				user: { login: "maya", avatarUrl: "a" },
				body: "LGTM",
				createdAt: "2026-10-01T00:00:00Z",
				htmlUrl: "https://github.com/acme/widgets/pull/7#issuecomment-9",
			},
		],
		fetchFailed: false,
	});
});
