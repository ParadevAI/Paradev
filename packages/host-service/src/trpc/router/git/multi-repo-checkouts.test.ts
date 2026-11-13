import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { simpleGit } from "simple-git";
import { seedProject, seedWorkspace } from "../../../../test/helpers/seed";
import { gitCeilingEnv } from "../../../runtime/git";
import { createTestDb } from "../pull-requests/shared/test-db";
import { gitRouter } from "./git";
import { testGitContext } from "./utils/test-checkout";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

async function initRepo(path: string, branch: string): Promise<void> {
	mkdirSync(path, { recursive: true });
	const git = simpleGit(path);
	await git.init([`--initial-branch=${branch}`]);
	await git.raw(["config", "user.email", "test@example.com"]);
	await git.raw(["config", "user.name", "test"]);
	await git.raw(["config", "commit.gpgsign", "false"]);
	await writeFile(join(path, "README.md"), `${branch}\n`);
	await git.add(".");
	await git.commit("initial");
}

/**
 * A workspace folder `<root>/ws` checking out `api` and `web`. The root is
 * itself a repository, as a workspace folder placed inside one would be.
 */
async function seedTwoRepoWorkspace(options: { webIsRepo?: boolean } = {}) {
	const root = realpathSync(mkdtempSync(join(tmpdir(), "multi-repo-git-")));
	roots.push(root);
	await initRepo(root, "outer");
	const workspacePath = join(root, "ws");
	await initRepo(join(workspacePath, "api"), "api-branch");
	if (options.webIsRepo === false) {
		mkdirSync(join(workspacePath, "web"), { recursive: true });
	} else {
		await initRepo(join(workspacePath, "web"), "web-branch");
	}
	const db = createTestDb();
	const project = seedProject(
		{ db },
		{
			repoPath: join(root, "api-source"),
			repoName: "api",
			repositories: [{ repoPath: join(root, "web-source"), repoName: "web" }],
		},
	);
	const [apiId, webId] = project.repositoryIds as [string, string];
	seedWorkspace(
		{ db },
		{
			id: "ws",
			projectId: project.id,
			worktreePath: workspacePath,
			branch: "x",
		},
	);
	return {
		caller: gitRouter.createCaller(testGitContext(db)),
		workspacePath,
		apiId,
		webId,
	};
}

describe("git on a multi-repo workspace", () => {
	test("a call without repositoryId is repository_required", async () => {
		const { caller } = await seedTwoRepoWorkspace();
		const error = await caller
			.listBranches({ workspaceId: "ws" })
			.catch((e: unknown) => e);
		expect(error).toBeInstanceOf(TRPCError);
		expect((error as TRPCError).code).toBe("BAD_REQUEST");
		expect((error as TRPCError).message).toStartWith("repository_required:");
	});

	test("an id the workspace does not check out is checkout_not_found", async () => {
		const { caller } = await seedTwoRepoWorkspace();
		const error = await caller
			.listBranches({ workspaceId: "ws", repositoryId: "nope" })
			.catch((e: unknown) => e);
		expect((error as TRPCError).code).toBe("NOT_FOUND");
		expect((error as TRPCError).message).toStartWith("checkout_not_found:");
	});

	test("each call acts on the checkout it names", async () => {
		const { caller, workspacePath, apiId, webId } =
			await seedTwoRepoWorkspace();

		const api = await caller.listBranches({
			workspaceId: "ws",
			repositoryId: apiId,
		});
		const web = await caller.listBranches({
			workspaceId: "ws",
			repositoryId: webId,
		});
		expect(api.branches).toEqual([{ name: "api-branch", isHead: true }]);
		expect(web.branches).toEqual([{ name: "web-branch", isHead: true }]);

		await writeFile(join(workspacePath, "web", "new.txt"), "hello\n");
		await caller.commit({
			workspaceId: "ws",
			repositoryId: webId,
			message: "web change",
		});
		const webLog = await simpleGit(join(workspacePath, "web")).log();
		const apiLog = await simpleGit(join(workspacePath, "api")).log();
		expect(webLog.latest?.message).toBe("web change");
		expect(apiLog.latest?.message).toBe("initial");
	});

	test("diff stats come back per checkout", async () => {
		const { caller, workspacePath, apiId, webId } =
			await seedTwoRepoWorkspace();
		await writeFile(join(workspacePath, "api", "a.txt"), "1\n2\n");
		await writeFile(join(workspacePath, "web", "README.md"), "changed\n");

		const { workspaces } = await caller.getDiffStatsByWorkspaces({
			workspaceIds: ["ws"],
		});

		expect(workspaces).toHaveLength(1);
		expect(workspaces[0]?.workspaceId).toBe("ws");
		const byRepository = Object.fromEntries(
			(workspaces[0]?.checkouts ?? []).map((c) => [c.repositoryId, c]),
		);
		expect(byRepository[apiId]).toMatchObject({ fileCount: 1, additions: 2 });
		expect(byRepository[webId]).toMatchObject({ fileCount: 1, deletions: 1 });
	});

	test("git cannot walk up from a checkout into the repository around it", async () => {
		const { caller, webId } = await seedTwoRepoWorkspace({ webIsRepo: false });

		const status = await caller.getBranchSyncStatus({
			workspaceId: "ws",
			repositoryId: webId,
		});

		// Without the ceiling, git would report the enclosing repository's `outer`.
		expect(status.currentBranch).toBeNull();
	});
});

test("the ceiling is the checkout's parent folder", () => {
	expect(gitCeilingEnv("/work/ws/api")).toEqual({
		GIT_CEILING_DIRECTORIES: "/work/ws",
	});
});
