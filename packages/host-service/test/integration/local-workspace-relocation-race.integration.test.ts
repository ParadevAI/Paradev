import { expect, test } from "bun:test";
import { repositories, workspaces } from "../../src/db/schema";
import { createCallerFactory } from "../../src/trpc";
import { workspacesRouter } from "../../src/trpc/router/workspaces/workspaces";
import type { HostServiceContext } from "../../src/types";
import { createGitFixture } from "../helpers/git-fixture";
import { createProjectScenario } from "../helpers/scenarios";

// Read 1 opens the project git client before the local path is chosen; read 2
// reads the checked-out branch, which a relocation must not outlive.
test("Local create rejects relocation during the branch read and retries on the new checkout", async () => {
	const pausedRead = 2;
	let gitReads = 0;
	const s = await createProjectScenario();
	const moved = await createGitFixture();
	const entered = Promise.withResolvers<void>();
	const release = Promise.withResolvers<void>();
	const ctx = {
		db: s.host.db,
		eventBus: s.host.eventBus,
		api: s.host.api,
		isAuthenticated: true,
		organizationId: "00000000-0000-0000-0000-000000000001",
		git: async () => {
			if (++gitReads === pausedRead) {
				entered.resolve();
				await release.promise;
			}
			return s.repo.git;
		},
	} as unknown as HostServiceContext;
	try {
		const caller = createCallerFactory(workspacesRouter)(ctx);
		const creating = caller.createLocal({
			projectId: s.projectId,
			name: "concurrent",
		});
		await entered.promise;
		await s.host.trpc.project.relocateRepository.mutate({
			projectId: s.projectId,
			repositoryId: s.repositoryId,
			path: moved.repoPath,
		});
		release.resolve();
		await expect(creating).rejects.toMatchObject({ code: "CONFLICT" });
		expect(s.host.db.select().from(workspaces).all()).toHaveLength(0);
		await s.host.trpc.workspaces.createLocal.mutate({
			projectId: s.projectId,
			name: "retried",
		});
		const row = s.host.db.select().from(workspaces).all()[0];
		const repository = s.host.db.select().from(repositories).all()[0];
		expect(row?.worktreePath).toBe(repository?.repoPath);
	} finally {
		release.resolve();
		await s.dispose();
		moved.dispose();
	}
});
