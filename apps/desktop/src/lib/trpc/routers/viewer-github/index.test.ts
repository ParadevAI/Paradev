import { describe, expect, test } from "bun:test";
import type { Octokit } from "@octokit/core";
import { createViewerGithubRouter } from ".";

function caller(token: string | null, octokit: Partial<Octokit> = {}) {
	const tokensUsed: string[] = [];
	const router = createViewerGithubRouter(
		{ getToken: async () => token },
		(used) => {
			tokensUsed.push(used);
			return octokit as Octokit;
		},
	);
	return { tokensUsed, call: router.createCaller({} as never) };
}

describe("viewer GitHub on this machine", () => {
	test("without a local login, says so instead of borrowing anyone's", async () => {
		const { call } = caller(null);
		expect(await call.status()).toEqual({ available: false });
		await expect(
			call.setPullRequestState({
				repoFullName: "acme/widgets",
				number: 7,
				state: "closed",
			}),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});

	test("a missing login is looked up once per window, not on every poll", async () => {
		let lookups = 0;
		let clock = 0;
		const router = createViewerGithubRouter(
			{
				getToken: async () => {
					lookups++;
					return null;
				},
			},
			() => ({}) as Octokit,
			() => clock,
		);
		const call = router.createCaller({} as never);
		for (let poll = 0; poll < 5; poll++) await call.status();
		expect(lookups).toBe(1);

		clock += 60_000;
		await call.status();
		expect(lookups).toBe(2);
	});

	test("acts with the local token and passes GitHub's refusal on as its code", async () => {
		const { call, tokensUsed } = caller("local-token", {
			request: (async () => {
				throw Object.assign(new Error("Pull Request is not mergeable"), {
					status: 405,
				});
			}) as unknown as Octokit["request"],
		});
		await expect(
			call.mergePullRequest({
				repoFullName: "acme/widgets",
				number: 7,
				mergeMethod: "squash",
			}),
		).rejects.toMatchObject({
			code: "CONFLICT",
			message: "Pull Request is not mergeable",
		});
		expect(tokensUsed).toEqual(["local-token"]);
	});

	test("a request that never reached GitHub is unavailable, not a server bug", async () => {
		const failWith = (error: Error) =>
			caller("local-token", {
				graphql: (async () => {
					throw error;
				}) as unknown as Octokit["graphql"],
				request: (async () => {
					throw error;
				}) as unknown as Octokit["request"],
			}).call.getPullRequestDetail({ repoFullName: "acme/widgets", number: 7 });

		const reset = Object.assign(new Error("read ECONNRESET"), {
			code: "ECONNRESET",
		});
		await expect(
			failWith(
				Object.assign(new Error("read ECONNRESET"), {
					status: 500,
					cause: new TypeError("fetch failed", { cause: reset }),
				}),
			),
		).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });

		await expect(
			failWith(Object.assign(new Error("Server Error"), { status: 500 })),
		).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
	});
});
