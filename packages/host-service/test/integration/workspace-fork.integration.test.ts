import { afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createUserSimpleGit } from "../../src/runtime/git/simple-git";
import { cloudFlows } from "../helpers/cloud-fakes";
import { createFeatureWorktreeScenario } from "../helpers/scenarios";

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
	await dispose?.();
	dispose = undefined;
});

test("the create API forks the source's exact HEAD and dirty state, and retries do not overwrite the fork", async () => {
	const scenario = await createFeatureWorktreeScenario({
		hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
	});
	dispose = scenario.dispose;
	const source = createUserSimpleGit(scenario.worktreePath, {
		env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
	});
	await writeFile(
		join(scenario.worktreePath, "feature.txt"),
		"committed feature\n",
	);
	await source.add("feature.txt");
	await source.commit("source-only commit");
	const head = (await source.revparse(["HEAD"])).trim();
	await writeFile(join(scenario.worktreePath, "feature.txt"), "staged\n");
	await source.add("feature.txt");
	await writeFile(join(scenario.worktreePath, "feature.txt"), "unstaged\n");
	await writeFile(join(scenario.worktreePath, "new.txt"), "untracked\n");
	const status = await source.raw(["status", "--porcelain=v1", "-uall"]);
	const input = {
		id: randomUUID(),
		projectId: scenario.projectId,
		name: "source fork",
		forkFromWorkspaceId: scenario.featureWorkspaceId,
		runSetup: false,
	};
	const result = await scenario.host.trpc.workspaces.create.mutate(input);
	const created = await scenario.host.trpc.workspace.get.query({
		id: result.workspace.id,
	});
	if (!created) throw new Error("Created workspace was not registered");
	const path = created.worktreePath;
	const fork = createUserSimpleGit(path);
	expect((await fork.revparse(["HEAD"])).trim()).toBe(head);
	expect(await fork.raw(["status", "--porcelain=v1", "-uall"])).toBe(status);
	expect(await fork.show([":feature.txt"])).toBe("staged\n");
	expect(await readFile(join(path, "feature.txt"), "utf8")).toBe("unstaged\n");
	expect(await readFile(join(path, "new.txt"), "utf8")).toBe("untracked\n");
	expect(await source.raw(["status", "--porcelain=v1", "-uall"])).toBe(status);
	await writeFile(join(path, "feature.txt"), "new work in fork\n");
	const retry = await scenario.host.trpc.workspaces.create.mutate(input);
	expect(retry.alreadyExists).toBe(true);
	expect(retry.workspace.id).toBe(result.workspace.id);
	expect(await readFile(join(path, "feature.txt"), "utf8")).toBe(
		"new work in fork\n",
	);
});

test("a missing fork source is rejected before creating a worktree", async () => {
	const scenario = await createFeatureWorktreeScenario({
		hostOptions: { apiOverrides: cloudFlows.workspaceCreateOk() },
	});
	dispose = scenario.dispose;
	await expect(
		scenario.host.trpc.workspaces.create.mutate({
			id: randomUUID(),
			projectId: scenario.projectId,
			name: "bad fork",
			forkFromWorkspaceId: randomUUID(),
			runSetup: false,
		}),
	).rejects.toThrow("Fork source must be an active workspace in this project");
});
