import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import type { StackRootPullRequest } from "../shared/pull-request-stack";
import {
	inNativeStack,
	stackGraphql,
	stackNode,
} from "../shared/stack-test-github";
import {
	createTestDb,
	PR_NUMBER,
	PROJECT_ID,
	REPO,
	readPullRequestRow,
	seedLinkedPullRequest,
	UNLINKED_PR_NUMBER,
} from "../shared/test-db";
import { mergeStack } from "./merge-stack";

const tempDirs: string[] = [];
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function createRepoWithOrigin(): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "pr-merge-stack-test-"));
	tempDirs.push(dir);
	const git = createUserSimpleGit(dir);
	await git.init();
	await git.addRemote(
		"origin",
		`https://github.com/${REPO.owner}/${REPO.name}.git`,
	);
	return (await git.revparse(["--show-toplevel"])).trim();
}

const createCaller = createCallerFactory(router({ mergeStack }));

async function createHarness(
	root: StackRootPullRequest,
	options: {
		open?: ReturnType<typeof stackNode>[];
		asyncMerge?: () => unknown;
	} = {},
) {
	const db = createTestDb();
	seedLinkedPullRequest(db, await createRepoWithOrigin());
	const requests: string[] = [];
	const merges: unknown[] = [];
	const refreshed: string[][] = [];
	const octokit = {
		graphql: stackGraphql(root, options.open),
		request: async (route: string) => {
			requests.push(route);
			return {
				data: options.asyncMerge
					? options.asyncMerge()
					: { status: "merged", details: {} },
			};
		},
		pulls: {
			merge: async (args: unknown) => {
				merges.push(args);
				return { data: { merged: true } };
			},
		},
	};
	const ctx = {
		db,
		github: async () => octokit,
		runtime: {
			pullRequests: {
				refreshPullRequestsByWorkspaces: async (ids: string[]) => {
					refreshed.push(ids);
				},
			},
		},
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext;
	return { caller: createCaller(ctx), db, requests, merges, refreshed };
}

const notFound = () => {
	throw Object.assign(new Error("Not Found"), { status: 404 });
};

describe("pullRequests.mergeStack", () => {
	const lower = stackNode(PR_NUMBER);
	const upper = stackNode(UNLINKED_PR_NUMBER, {
		baseRefName: lower.headRefName,
	});

	test("lands a native stack in one async merge and records every layer merged", async () => {
		const harness = await createHarness(inNativeStack(upper, [lower, upper]));

		const result = await harness.caller.mergeStack({
			projectId: PROJECT_ID,
			prNumber: UNLINKED_PR_NUMBER,
			mergeMethod: "squash",
		});

		expect(result).toEqual({
			outcome: "merged",
			numbers: [PR_NUMBER, UNLINKED_PR_NUMBER],
		});
		expect(harness.requests).toEqual([
			"PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge-async",
		]);
		expect(harness.merges).toEqual([]);
		expect(readPullRequestRow(harness.db, "pr-42")?.state).toBe("merged");
		expect(readPullRequestRow(harness.db, "pr-43")?.state).toBe("merged");
		expect(harness.refreshed).toEqual([["ws-newer", "ws-older"]]);
	});

	test("falls back to an ordinary merge without the API when only one layer lands", async () => {
		const harness = await createHarness(inNativeStack(lower, [lower, upper]), {
			asyncMerge: notFound,
		});

		const result = await harness.caller.mergeStack({
			projectId: PROJECT_ID,
			prNumber: PR_NUMBER,
		});

		expect(result.outcome).toBe("merged");
		expect(harness.merges).toEqual([
			{
				owner: REPO.owner,
				repo: REPO.name,
				pull_number: PR_NUMBER,
				merge_method: "merge",
			},
		]);
	});

	test("refuses the fallback when it would land only the top of the prefix", async () => {
		const harness = await createHarness(inNativeStack(upper, [lower, upper]), {
			asyncMerge: notFound,
		});

		await expect(
			harness.caller.mergeStack({
				projectId: PROJECT_ID,
				prNumber: UNLINKED_PR_NUMBER,
			}),
		).rejects.toThrow(`Merge #${PR_NUMBER} first.`);
		expect(harness.merges).toEqual([]);
	});

	test("refuses an inferred layer above an open one before calling GitHub", async () => {
		const harness = await createHarness(upper, { open: [lower, upper] });

		await expect(
			harness.caller.mergeStack({
				projectId: PROJECT_ID,
				prNumber: UNLINKED_PR_NUMBER,
			}),
		).rejects.toThrow(`Merge #${PR_NUMBER} first.`);
		expect(harness.requests).toEqual([]);
		expect(harness.merges).toEqual([]);
	});
});
