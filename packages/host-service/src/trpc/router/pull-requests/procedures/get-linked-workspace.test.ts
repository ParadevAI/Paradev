import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { HostDb } from "../../../../db";
import {
	projects,
	pullRequests,
	repositories,
	workspaceRepositories,
	workspaces,
} from "../../../../db/schema";
import { createUserSimpleGit } from "../../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../../types";
import { createCallerFactory, router } from "../../../index";
import {
	createTestDb,
	PR_NUMBER,
	PROJECT_ID,
	REPO,
	REPOSITORY_ID,
	seedLinkedPullRequest,
	UNLINKED_PR_NUMBER,
} from "../shared/test-db";
import { getLinkedWorkspace } from "./get-linked-workspace";

const tempDirs: string[] = [];
afterAll(() => {
	for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

async function createRepoWithOrigin(): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), "pr-linked-test-"));
	tempDirs.push(dir);
	const git = createUserSimpleGit(dir);
	await git.init();
	await git.addConfig("user.email", "test@test.local");
	await git.addConfig("user.name", "Test");
	await git.raw(["commit", "--allow-empty", "-m", "init"]);
	await git.addRemote(
		"origin",
		`https://github.com/${REPO.owner}/${REPO.name}.git`,
	);
	return (await git.revparse(["--show-toplevel"])).trim();
}

const createCaller = createCallerFactory(router({ getLinkedWorkspace }));

/** Both checkouts are gone, so each repository answers from the rows it wrote. */
function seedTwoRepositoriesWithPullRequest12(db: HostDb) {
	db.insert(projects)
		.values({ id: "multi", primaryRepositoryId: "repo-a" })
		.run();
	for (const name of ["a", "b"]) {
		db.insert(repositories)
			.values({
				id: `repo-${name}`,
				projectId: "multi",
				name,
				repoPath: `/nonexistent/${name}`,
			})
			.run();
		db.insert(pullRequests)
			.values({
				id: `pr-${name}`,
				repositoryId: `repo-${name}`,
				repoProvider: "github",
				repoOwner: "acme",
				repoName: name,
				prNumber: 12,
				url: `https://github.com/acme/${name}/pull/12`,
				title: "PR 12",
				state: "open",
				headBranch: "feature",
				headSha: "sha",
			})
			.run();
		db.insert(workspaces)
			.values({
				id: `ws-${name}`,
				projectId: "multi",
				worktreePath: `/nonexistent/ws-${name}`,
				branch: "feature",
			})
			.run();
	}
	for (const workspace of ["a", "b"]) {
		for (const repository of ["a", "b"]) {
			db.insert(workspaceRepositories)
				.values({
					workspaceId: `ws-${workspace}`,
					repositoryId: `repo-${repository}`,
					branch: "feature",
					pullRequestId: workspace === repository ? `pr-${repository}` : null,
				})
				.run();
		}
	}
}

function callerFor(db: ReturnType<typeof createTestDb>) {
	return createCaller({
		db,
		isAuthenticated: true,
		organizationId: "org-test",
	} as unknown as HostServiceContext);
}

describe("pullRequests.getLinkedWorkspace", () => {
	test("answers the most recently active linked workspace through the repository", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, await createRepoWithOrigin());

		expect(
			await callerFor(db).getLinkedWorkspace({
				projectId: PROJECT_ID,
				prNumber: PR_NUMBER,
			}),
		).toEqual({ workspaceId: "ws-newer", repositoryId: REPOSITORY_ID });
	});

	test("still answers an existing link when the checkout is unavailable", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/nonexistent/checkout");

		expect(
			await callerFor(db).getLinkedWorkspace({
				projectId: PROJECT_ID,
				prNumber: PR_NUMBER,
			}),
		).toEqual({ workspaceId: "ws-newer", repositoryId: REPOSITORY_ID });
	});

	test("a number two repositories of the project have answers only once the repository is named", async () => {
		const db = createTestDb();
		seedTwoRepositoriesWithPullRequest12(db);
		const caller = callerFor(db);

		expect(
			await caller.getLinkedWorkspace({ projectId: "multi", prNumber: 12 }),
		).toEqual({ workspaceId: null, repositoryId: null });
		expect(
			await caller.getLinkedWorkspace({
				projectId: "multi",
				prNumber: 12,
				repoFullName: "acme/B",
			}),
		).toEqual({ workspaceId: "ws-b", repositoryId: "repo-b" });
		expect(
			await caller.getLinkedWorkspace({
				projectId: "multi",
				prNumber: 12,
				repositoryId: "repo-a",
			}),
		).toEqual({ workspaceId: "ws-a", repositoryId: "repo-a" });
	});

	test("answers none for a PR with a row but no live workspace", async () => {
		const db = createTestDb();
		seedLinkedPullRequest(db, "/nonexistent/checkout");

		expect(
			await callerFor(db).getLinkedWorkspace({
				projectId: PROJECT_ID,
				prNumber: UNLINKED_PR_NUMBER,
			}),
		).toEqual({ workspaceId: null, repositoryId: null });
	});
});
