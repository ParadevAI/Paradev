import { afterEach, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { eq } from "drizzle-orm";
import { workspaces } from "../../src/db/schema";
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
		await host.dispose();
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
