/**
 * Round 3 of bug-hunting.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { projects } from "../../src/db/schema";
import { createTestHost, type TestHost } from "../helpers/createTestHost";
import { createGitFixture, type GitFixture } from "../helpers/git-fixture";

describe("bug-hunt-3: workspace.delete + dirty worktree", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();

	beforeEach(async () => {
		repo = await createGitFixture();
	});

	afterEach(async () => {
		if (host) await host.dispose();
		repo.dispose();
	});

	test("workspace.delete forces removal through the v2 cleanup saga", async () => {
		const workspaceId = randomUUID();
		const worktreePath = join(repo.repoPath, ".worktrees", "feature-dirty");
		await repo.git.raw([
			"worktree",
			"add",
			"-b",
			"feature/dirty",
			worktreePath,
		]);
		// Make it dirty.
		const { writeFileSync } = await import("node:fs");
		writeFileSync(join(worktreePath, "dirt.txt"), "uncommitted");

		host = await createTestHost({
			apiOverrides: {
				"v2Workspace.getFromHost.query": () => ({ type: "feature" }),
				"v2Workspace.delete.mutate": () => ({ success: true }),
			},
		});
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		const { workspaces } = await import("../../src/db/schema");
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath,
				branch: "feature/dirty",
			})
			.run();

		const result = await host.trpc.workspace.delete.mutate({ id: workspaceId });
		expect(result.success).toBe(true);
		expect(result.worktreeRemoved).toBe(true);
		expect(result.warnings).toEqual([]);
		expect(existsSync(worktreePath)).toBe(false);
	});
});

describe("bug-hunt-3: race + repeated config writes", () => {
	let host: TestHost;
	let repo: GitFixture;
	const projectId = randomUUID();
	const workspaceId = randomUUID();

	beforeEach(async () => {
		host = await createTestHost();
		repo = await createGitFixture();
		host.db
			.insert(projects)
			.values({ id: projectId, repoPath: repo.repoPath })
			.run();
		const { workspaces } = await import("../../src/db/schema");
		host.db
			.insert(workspaces)
			.values({
				id: workspaceId,
				projectId,
				worktreePath: repo.repoPath,
				branch: "main",
			})
			.run();
	});

	afterEach(async () => {
		await host.dispose();
		repo.dispose();
	});

	// Regression: two concurrent setBaseBranch calls used to race on
	// `.git/config.lock`. One would return a 500 with "error: could not
	// lock config file .git/config: File exists" on a renderer double-
	// click during a slow request. Fixed by routing config writes through
	// `gitConfigWrite`, which retries on lock contention.
	test("parallel setBaseBranch writes converge without a config-lock 500", async () => {
		await Promise.all([
			host.trpc.git.setBaseBranch.mutate({
				workspaceId,
				baseBranch: "main",
			}),
			host.trpc.git.setBaseBranch.mutate({
				workspaceId,
				baseBranch: "develop",
			}),
		]);

		const result = await host.trpc.git.getBaseBranch.query({ workspaceId });
		expect(["main", "develop"]).toContain(result.baseBranch);
	});
});
