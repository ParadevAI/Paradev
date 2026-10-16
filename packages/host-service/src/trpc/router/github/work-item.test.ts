import { describe, expect, it, mock } from "bun:test";
import type { Octokit } from "@octokit/rest";
import type { TRPCError } from "@trpc/server";
import { createGithubWorkItemLoader, summarizeBody } from "./work-item";

const PR = {
	number: 8329,
	html_url: "https://github.com/superset-sh/superset/pull/8329",
	title: "feat(chat): load whole sessions",
	state: "closed",
	merged: true,
	draft: false,
	body: "## Summary\n\nLoads a session through an **outline**.\n\n```ts\nignored\n```\n<!-- hidden -->",
	user: { login: "AviPeltz", avatar_url: "https://avatars/avi" },
	base: { ref: "main" },
	head: { ref: "feat/chat-whole-sessions" },
	labels: [{ name: "desktop", color: "1d76db" }, "chat"],
	assignees: [{ login: "AviPeltz", avatar_url: "https://avatars/avi" }],
	updated_at: "2026-10-12T20:00:00Z",
};

const ISSUE = {
	number: 42,
	html_url: "https://github.com/acme/widgets/issues/42",
	title: "Widgets wobble",
	state: "closed",
	state_reason: "not_planned",
	body: null,
	user: null,
	labels: [],
	assignees: [],
	updated_at: "2026-10-01T00:00:00Z",
};

function fakeOctokit(
	options: { prStatus?: number; issue?: object; token?: string } = {},
) {
	const pullsGet = mock(async () => {
		if (options.prStatus)
			throw Object.assign(new Error("nope"), { status: options.prStatus });
		return { data: PR };
	});
	const issuesGet = mock(async () => ({ data: options.issue ?? ISSUE }));
	const octokit = {
		auth: async () => ({ type: "token", token: options.token ?? "token-a" }),
		pulls: { get: pullsGet },
		issues: { get: issuesGet },
	} as unknown as Octokit;
	return { octokit, pullsGet, issuesGet };
}

describe("github work item loader", () => {
	it("reads a merged pull request into the glance shape", async () => {
		const { octokit } = fakeOctokit();
		const load = createGithubWorkItemLoader();
		expect(
			await load(octokit, {
				owner: "superset-sh",
				repo: "superset",
				kind: "pr",
				number: 8329,
			}),
		).toEqual({
			kind: "pr",
			repo: "superset-sh/superset",
			number: 8329,
			url: PR.html_url,
			title: PR.title,
			state: "merged",
			draft: false,
			stateReason: null,
			summary: "Summary Loads a session through an outline.",
			author: { login: "AviPeltz", avatarUrl: "https://avatars/avi" },
			baseRefName: "main",
			headRefName: "feat/chat-whole-sessions",
			labels: [
				{ name: "desktop", color: "1d76db" },
				{ name: "chat", color: "" },
			],
			assignees: [{ login: "AviPeltz", avatarUrl: "https://avatars/avi" }],
			updatedAt: PR.updated_at,
		});
	});

	it("reads a closed issue with its reason and no author", async () => {
		const { octokit } = fakeOctokit();
		const item = await createGithubWorkItemLoader()(octokit, {
			owner: "acme",
			repo: "widgets",
			kind: "issue",
			number: 42,
		});
		expect(item).toMatchObject({
			kind: "issue",
			state: "closed",
			stateReason: "not_planned",
			summary: "",
			author: null,
			baseRefName: null,
		});
	});

	it("does not answer one credential from another's cache", async () => {
		const load = createGithubWorkItemLoader();
		const ref = {
			owner: "superset-sh",
			repo: "superset",
			kind: "pr" as const,
			number: 8329,
		};
		const first = fakeOctokit({ token: "token-a" });
		const second = fakeOctokit({ token: "token-b" });
		await load(first.octokit, ref);
		await load(second.octokit, ref);
		await load(first.octokit, ref);
		expect(first.pullsGet).toHaveBeenCalledTimes(1);
		expect(second.pullsGet).toHaveBeenCalledTimes(1);
	});

	it("remembers an item for a while, and forgets a failed lookup", async () => {
		let clock = 0;
		const { octokit, pullsGet } = fakeOctokit();
		const load = createGithubWorkItemLoader(() => clock);
		const ref = {
			owner: "superset-sh",
			repo: "superset",
			kind: "pr" as const,
			number: 8329,
		};
		await Promise.all([load(octokit, ref), load(octokit, ref)]);
		expect(pullsGet).toHaveBeenCalledTimes(1);
		clock = 3 * 60 * 1000;
		await load(octokit, ref);
		expect(pullsGet).toHaveBeenCalledTimes(2);

		const missing = fakeOctokit({ prStatus: 404 });
		const loadMissing = createGithubWorkItemLoader();
		const error = (await loadMissing(missing.octokit, ref).catch(
			(e: unknown) => e,
		)) as TRPCError;
		expect(error.code).toBe("NOT_FOUND");
		await loadMissing(missing.octokit, ref).catch(() => {});
		expect(missing.pullsGet).toHaveBeenCalledTimes(2);
	});

	it("does not pass a pull request off as an issue", async () => {
		const { octokit } = fakeOctokit({
			issue: { ...ISSUE, pull_request: { url: "x" } },
		});
		const error = (await createGithubWorkItemLoader()(octokit, {
			owner: "acme",
			repo: "widgets",
			kind: "issue",
			number: 42,
		}).catch((e: unknown) => e)) as TRPCError;
		expect(error.code).toBe("NOT_FOUND");
	});
});

describe("summarizeBody", () => {
	it("keeps the words and drops the markup, to one glance", () => {
		expect(
			summarizeBody(
				"- [x] done\n\n![shot](a.png) see [docs](http://x) `code` <b>bold</b> _em_ snake_case > quoted",
			),
		).toBe("- [x] done see docs code bold em snake_case quoted");
		expect(summarizeBody("a".repeat(400))).toHaveLength(281);
		expect(summarizeBody(undefined)).toBe("");
	});
});
