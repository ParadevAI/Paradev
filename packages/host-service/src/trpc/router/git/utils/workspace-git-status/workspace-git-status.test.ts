import { afterEach, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { simpleGit } from "simple-git";
import {
	seedProject,
	seedWorkspace,
} from "../../../../../../test/helpers/seed";
import type { HostServiceContext } from "../../../../../types";
import { createTestDb } from "../../../pull-requests/shared/test-db";
import { readWorkspaceGitStatus } from "./workspace-git-status";

const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function setUp(onDisk: string[]) {
	const root = mkdtempSync(join(tmpdir(), "workspace-git-status-"));
	roots.push(root);
	for (const name of onDisk) {
		mkdirSync(join(root, name));
		execFileSync("git", ["init", "-q", join(root, name)]);
	}
	const db = createTestDb();
	const project = seedProject(
		{ db },
		{
			repoPath: "/src/api",
			repoName: "api",
			repositories: [{ repoPath: "/src/web", repoName: "web" }],
		},
	);
	seedWorkspace(
		{ db },
		{ id: "ws", projectId: project.id, worktreePath: root, branch: "b" },
	);
	const ctx = {
		db,
		git: async (path: string) => simpleGit(path),
	} as unknown as Pick<HostServiceContext, "db" | "git">;
	return { ctx, repositoryIds: project.repositoryIds as [string, string] };
}

test("a missing checkout is reported as missing and the others still read", async () => {
	const { ctx, repositoryIds } = setUp(["web"]);
	const [apiId, webId] = repositoryIds;

	const { checkouts } = await readWorkspaceGitStatus(ctx, "ws");

	expect(checkouts.map((c) => [c.repositoryId, c.missing])).toEqual([
		[apiId, true],
		[webId, false],
	]);
});

test("a workspace with every checkout missing is a NOT_FOUND error", async () => {
	const { ctx } = setUp([]);

	await expect(readWorkspaceGitStatus(ctx, "ws")).rejects.toMatchObject({
		code: "NOT_FOUND",
	});
});
