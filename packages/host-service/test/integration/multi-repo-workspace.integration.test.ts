import { afterEach, expect, spyOn, test } from "bun:test";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import { eq, isNull } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
import { repositoryRootPathFor } from "../../src/projects/multi-repo";
import * as naming from "../../src/trpc/router/workspace-creation/utils/ai-workspace-names";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createTestHost } from "../helpers/createTestHost";
import { createGitFixture } from "../helpers/git-fixture";
import { seedPullRequest } from "../helpers/seed";

let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
	await dispose?.();
	dispose = undefined;
});

async function containerScenario() {
	const host = await createTestHost({
		apiOverrides: cloudFlows.workspaceCreateOk(),
	});
	const web = await createGitFixture();
	const api = await createGitFixture();
	dispose = async () => {
		const roots = host.db
			.select({ worktreePath: workspaces.worktreePath })
			.from(workspaces)
			.where(isNull(workspaces.parentWorkspaceId))
			.all();
		await host.dispose();
		for (const { worktreePath } of roots) {
			rmSync(worktreePath, { recursive: true, force: true });
		}
		web.dispose();
		api.dispose();
	};
	const { projectId } = await host.trpc.project.createContainer.mutate({
		name: "orbit",
		repoPaths: [web.repoPath, api.repoPath],
	});
	return {
		host,
		projectId,
		repoPaths: [web.repoPath, api.repoPath],
		fixtures: [web, api],
	};
}

test("a container workspace holds a checkout of every repository and removes them together", async () => {
	const { host, projectId, repoPaths } = await containerScenario();
	const { trpc } = host;
	expect((await trpc.project.list.query()).map((row) => row.id)).toEqual([
		projectId,
	]);

	const { workspace } = await trpc.workspaces.create.mutate({
		projectId,
		name: "both",
		branch: "feature/both",
	});

	const checkouts = await trpc.workspace.repositories.query({
		workspaceId: workspace.id,
	});
	expect(checkouts.map((checkout) => checkout.name)).toEqual(
		repoPaths.map((path) => basename(path)),
	);
	const root = dirname(checkouts[0]?.worktreePath ?? "");
	for (const checkout of checkouts) {
		expect(checkout.branch).toBe("feature/both");
		expect(existsSync(join(checkout.worktreePath, ".git"))).toBe(true);
	}
	expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toContain(
		checkouts[0]?.worktreePath ?? "missing",
	);
	expect((await trpc.workspace.list.query()).map((row) => row.id)).toEqual([
		workspace.id,
	]);

	await trpc.workspaceCleanup.destroy.mutate({ workspaceId: workspace.id });
	expect(existsSync(root)).toBe(false);
});

test("deleting a container project frees its repositories, and restoring brings them back", async () => {
	const { host, projectId, repoPaths } = await containerScenario();
	const { trpc } = host;

	await trpc.project.remove.mutate({ projectId });
	expect(
		(await trpc.project.listDeleted.query()).map((project) => project.id),
	).toEqual([projectId]);

	await trpc.project.restore.mutate({ projectId });
	expect(
		(await trpc.project.repositories.query({ projectId })).map(
			(repository) => repository.repoPath,
		),
	).toEqual(repoPaths);
});

async function containerWorkspace() {
	const scenario = await containerScenario();
	const { workspace } = await scenario.host.trpc.workspaces.create.mutate({
		projectId: scenario.projectId,
		name: "both",
		branch: "feature/both",
	});
	const checkouts = await scenario.host.trpc.workspace.repositories.query({
		workspaceId: workspace.id,
	});
	return { ...scenario, workspace, checkouts };
}

test("the delete preview warns about uncommitted changes in any checkout", async () => {
	const { host, workspace, checkouts } = await containerWorkspace();
	writeFileSync(join(checkouts[1]?.worktreePath ?? "", "dirty.txt"), "wip");

	const preview = await host.trpc.workspaceCleanup.inspect.query({
		workspaceId: workspace.id,
	});
	expect(preview.hasChanges).toBe(true);
});

test("a dirty checkout blocks the delete before any checkout is removed", async () => {
	const { host, workspace, checkouts } = await containerWorkspace();
	writeFileSync(join(checkouts[1]?.worktreePath ?? "", "dirty.txt"), "wip");

	await expect(
		host.trpc.workspaceCleanup.destroy.mutate({ workspaceId: workspace.id }),
	).rejects.toThrow("uncommitted changes");
	for (const checkout of checkouts) {
		expect(existsSync(checkout.worktreePath)).toBe(true);
	}
});

test("the pull request lookup for a container workspace reports a checkout's pull request", async () => {
	const { host, workspace, checkouts } = await containerWorkspace();
	const checkout = host.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, checkouts[1]?.id ?? ""))
		.get();
	const { id: pullRequestId } = seedPullRequest(host, {
		projectId: checkout?.projectId ?? "",
		prNumber: 7,
		title: "api change",
		headBranch: "feature/both",
	});
	host.db
		.update(workspaces)
		.set({ pullRequestId })
		.where(eq(workspaces.id, checkout?.id ?? ""))
		.run();

	const result = await host.trpc.pullRequests.getByWorkspaces.query({
		workspaceIds: [workspace.id],
	});
	expect(result.workspaces.some((row) => row.pullRequest?.number === 7)).toBe(
		true,
	);
});

test("each checkout reports its own sync state, for the ship actions", async () => {
	const { host, checkouts } = await containerWorkspace();
	writeFileSync(join(checkouts[0]?.worktreePath ?? "", "dirty.txt"), "wip");

	const [first, second] = await Promise.all(
		checkouts.map((checkout) =>
			host.trpc.git.getBranchSyncStatus.query({ workspaceId: checkout.id }),
		),
	);
	expect(first).toMatchObject({ hasUncommitted: true });
	expect(second).toMatchObject({ hasUncommitted: false });
});

test("each checkout reports its own pull request, for the Review tab", async () => {
	const { host, checkouts } = await containerWorkspace();
	const checkout = host.db
		.select()
		.from(workspaces)
		.where(eq(workspaces.id, checkouts[1]?.id ?? ""))
		.get();
	const { id: pullRequestId } = seedPullRequest(host, {
		projectId: checkout?.projectId ?? "",
		prNumber: 7,
		title: "api change",
		headBranch: "feature/both",
	});
	host.db
		.update(workspaces)
		.set({ pullRequestId })
		.where(eq(workspaces.id, checkout?.id ?? ""))
		.run();

	const [first, second] = await Promise.all(
		checkouts.map((checkout) =>
			host.trpc.git.getPullRequest.query({ workspaceId: checkout.id }),
		),
	);
	expect(first).toBeNull();
	expect(second).toMatchObject({ number: 7 });
});

test("each repository branches from the base branch picked for it", async () => {
	const { host, projectId, fixtures } = await containerScenario();
	const api = fixtures[1];
	await api?.git.checkoutLocalBranch("release");
	await api?.commit("release work", { "release.txt": "v2" });
	await api?.git.checkout("main");
	const repositories = await host.trpc.project.repositories.query({
		projectId,
	});

	const { workspace } = await host.trpc.workspaces.create.mutate({
		projectId,
		name: "both",
		branch: "feature/both",
		repositoryBaseBranches: { [repositories[1]?.id ?? ""]: "release" },
	});

	const [web, apiCheckout] = await host.trpc.workspace.repositories.query({
		workspaceId: workspace.id,
	});
	expect(existsSync(join(web?.worktreePath ?? "", "release.txt"))).toBe(false);
	expect(existsSync(join(apiCheckout?.worktreePath ?? "", "release.txt"))).toBe(
		true,
	);
	expect(
		(await api?.git.raw(["config", "branch.feature/both.base"]))?.trim(),
	).toBe("release");
});

test("file search finds files deep inside every checkout", async () => {
	const { host, workspace, checkouts } = await containerWorkspace();
	const api = checkouts[1];
	if (!api) throw new Error("missing checkout");
	const deepDir = join(api.worktreePath, "a/b/c/d/e/f/g/h/i");
	mkdirSync(deepDir, { recursive: true });
	writeFileSync(join(deepDir, "deep-target.ts"), "export {};\n");

	const { matches } = await host.trpc.filesystem.searchFiles.query({
		workspaceId: workspace.id,
		query: "deep-target",
	});

	expect(matches.map((match) => match.relativePath)).toEqual([
		`${basename(api.worktreePath)}/a/b/c/d/e/f/g/h/i/deep-target.ts`,
	]);
});

test("restoring a deleted container workspace brings back every checkout", async () => {
	const { host, workspace, checkouts } = await containerWorkspace();
	const root = dirname(checkouts[0]?.worktreePath ?? "");
	await host.trpc.workspaceCleanup.destroy.mutate({
		workspaceId: workspace.id,
	});
	expect(existsSync(root)).toBe(false);

	await host.trpc.workspaces.restore.mutate({ workspaceId: workspace.id });

	const restored = await host.trpc.workspace.repositories.query({
		workspaceId: workspace.id,
	});
	expect(restored.map((checkout) => checkout.id)).toEqual(
		checkouts.map((checkout) => checkout.id),
	);
	for (const checkout of restored) {
		expect(checkout.branch).toBe("feature/both");
		expect(existsSync(join(checkout.worktreePath, ".git"))).toBe(true);
	}
	expect(existsSync(join(root, "AGENTS.md"))).toBe(true);
});

test("each checkout reports its own run script, for the Run menu", async () => {
	const { host, projectId, workspace, checkouts } = await containerWorkspace();
	const [webProject, apiProject] = await host.trpc.project.repositories.query({
		projectId,
	});
	if (!webProject || !apiProject) throw new Error("missing repositories");
	await host.trpc.config.updateConfig.mutate({
		projectId: apiProject.id,
		run: ["bun server.ts"],
	});

	const definitions = await host.trpc.config.getRepositoryRunDefinitions.query({
		workspaceId: workspace.id,
	});

	expect(definitions).toEqual([
		{
			repositoryId: checkouts[0]?.id ?? "",
			projectId: webProject.id,
			commands: null,
			cwd: null,
		},
		{
			repositoryId: checkouts[1]?.id ?? "",
			projectId: apiProject.id,
			commands: ["bun server.ts"],
			cwd: checkouts[1]?.worktreePath ?? "",
		},
	]);
});

test("the container's diff stats sum every checkout, for the Workspaces board", async () => {
	const { host, workspace, checkouts } = await containerWorkspace();
	writeFileSync(join(checkouts[0]?.worktreePath ?? "", "a.txt"), "one\n");
	writeFileSync(join(checkouts[1]?.worktreePath ?? "", "b.txt"), "one\ntwo\n");

	const { workspaces: stats } =
		await host.trpc.git.getDiffStatsByWorkspaces.query({
			workspaceIds: [workspace.id],
		});

	expect(stats).toEqual([
		{ workspaceId: workspace.id, additions: 3, deletions: 0, fileCount: 2 },
	]);
});

test("renaming the branch in one checkout renames it in every checkout", async () => {
	const { host, workspace, checkouts } = await containerWorkspace();

	await host.trpc.git.renameBranch.mutate({
		workspaceId: checkouts[0]?.id ?? "",
		oldName: "feature/both",
		newName: "feature/renamed",
	});

	const renamed = await host.trpc.workspace.repositories.query({
		workspaceId: workspace.id,
	});
	expect(renamed.map((checkout) => checkout.branch)).toEqual([
		"feature/renamed",
		"feature/renamed",
	]);
	for (const checkout of checkouts) {
		const head = Bun.spawnSync(["git", "branch", "--show-current"], {
			cwd: checkout.worktreePath,
		});
		expect(head.stdout.toString().trim()).toBe("feature/renamed");
	}
	const container = host.db
		.select({ branch: workspaces.branch })
		.from(workspaces)
		.where(eq(workspaces.id, workspace.id))
		.get();
	expect(container?.branch).toBe("feature/renamed");
});

test("moving a multi-repo workspace is refused with a clear reason", async () => {
	const { host, workspace } = await containerWorkspace();

	await expect(
		host.trpc.teleport.prepareWorkspace.mutate({ workspaceId: workspace.id }),
	).rejects.toThrow("A multi-repo workspace cannot be moved yet");
});

test("a terminal inside a checkout gets that repository's main checkout as its root path", async () => {
	const { host, workspace, checkouts, repoPaths } = await containerWorkspace();
	const root = dirname(checkouts[0]?.worktreePath ?? "");

	expect(
		repositoryRootPathFor(
			host.db,
			workspace.id,
			join(checkouts[1]?.worktreePath ?? "", "src"),
		),
	).toBe(repoPaths[1] ?? "missing");
	expect(repositoryRootPathFor(host.db, workspace.id, root)).toBe("");
});

test("a shared base branch applies to every repository that has it", async () => {
	const { host, projectId, fixtures } = await containerScenario();
	const api = fixtures[1];
	if (!api) throw new Error("missing fixture");
	await api.git.checkoutLocalBranch("release");
	await api.commit("release only", { "release.txt": "release" });
	await api.git.checkout("main");

	const { workspace } = await host.trpc.workspaces.create.mutate({
		projectId,
		name: "from release",
		branch: "feature/from-release",
		baseBranch: "release",
	});

	const [web, apiCheckout] = await host.trpc.workspace.repositories.query({
		workspaceId: workspace.id,
	});
	expect(existsSync(join(apiCheckout?.worktreePath ?? "", "release.txt"))).toBe(
		true,
	);
	expect(existsSync(join(web?.worktreePath ?? "", "README.md"))).toBe(true);
});

test("a local-checkout workspace is refused for a multi-repo project", async () => {
	const { host, projectId } = await containerScenario();

	await expect(
		host.trpc.workspaces.create.mutate({ projectId, checkout: "local" }),
	).rejects.toThrow("A multi-repo project has no single checkout");
});

test("AI naming renames the branch in every checkout", async () => {
	const generator = spyOn(
		naming,
		"generateWorkspaceNamesFromPrompt",
	).mockResolvedValue({ title: "Fix login", branchName: "repair-auth" });
	try {
		const { host, projectId } = await containerScenario();
		const { workspace } = await host.trpc.workspaces.create.mutate({
			projectId,
			namingPrompt: "Fix the login bug",
		});
		const containerRow = () =>
			host.db
				.select()
				.from(workspaces)
				.where(eq(workspaces.id, workspace.id))
				.get();
		for (let i = 0; i < 200 && containerRow()?.name !== "Fix login"; i++) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}

		const branch = containerRow()?.branch ?? "";
		expect(containerRow()?.name).toBe("Fix login");
		expect(branch).toContain("repair-auth");
		const checkouts = await host.trpc.workspace.repositories.query({
			workspaceId: workspace.id,
		});
		for (const checkout of checkouts) {
			const head = Bun.spawnSync(["git", "branch", "--show-current"], {
				cwd: checkout.worktreePath,
			});
			expect(head.stdout.toString().trim()).toBe(branch);
			expect(checkout.branch).toBe(branch);
		}
	} finally {
		generator.mockRestore();
	}
});

test("a repository that fails to check out undoes the whole create", async () => {
	const { host, projectId, fixtures } = await containerScenario();
	const [web, api] = fixtures;
	if (!web || !api) throw new Error("missing fixture");
	rmSync(join(api.repoPath, ".git"), { recursive: true, force: true });

	await expect(
		host.trpc.workspaces.create.mutate({
			projectId,
			name: "broken",
			branch: "feature/broken",
		}),
	).rejects.toThrow(basename(api.repoPath));

	expect(host.db.select().from(workspaces).all()).toEqual([]);
	const worktrees = Bun.spawnSync(["git", "worktree", "list"], {
		cwd: web.repoPath,
	});
	expect(worktrees.stdout.toString().trim().split("\n")).toHaveLength(1);
	const branches = Bun.spawnSync(
		["git", "branch", "--list", "feature/broken"],
		{
			cwd: web.repoPath,
		},
	);
	expect(branches.stdout.toString().trim()).toBe("");
});
