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

	test("signs a private attachment with the local token, and gives null without one", async () => {
		const attachment =
			"https://github.com/user-attachments/assets/eba1526e-7388-4ed6-b058-c2ffcca091dd";
		const signedWith: string[] = [];
		const routerFor = (token: string | null) =>
			createViewerGithubRouter(
				{ getToken: async () => token },
				() => ({}) as Octokit,
				() => 0,
				async (_url, used) => {
					signedWith.push(used);
					return "https://signed.example/shot.png";
				},
			).createCaller({} as never);

		expect(
			await routerFor("local-token").getAttachmentUrl({ url: attachment }),
		).toEqual({ url: "https://signed.example/shot.png" });
		expect(await routerFor(null).getAttachmentUrl({ url: attachment })).toEqual(
			{ url: null },
		);
		expect(signedWith).toEqual(["local-token"]);
		await expect(
			routerFor("local-token").getAttachmentUrl({
				url: "https://example.com/x.png",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("without a login, failed attachments look the login up once per window", async () => {
		let lookups = 0;
		const call = createViewerGithubRouter(
			{
				getToken: async () => {
					lookups++;
					return null;
				},
			},
			() => ({}) as Octokit,
			() => 0,
		).createCaller({} as never);
		for (const id of ["0", "1", "2"]) {
			expect(
				await call.getAttachmentUrl({
					url: `https://github.com/user-attachments/assets/eba1526e-7388-4ed6-b058-c2ffcca091d${id}`,
				}),
			).toEqual({ url: null });
		}
		expect(lookups).toBe(1);
	});
});
