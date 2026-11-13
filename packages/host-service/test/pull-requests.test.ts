import { describe, expect, mock, spyOn, test } from "bun:test";
import { workspaceRepositories, workspaces } from "../src/db/schema";
import { PullRequestRuntimeManager } from "../src/runtime/pull-requests/pull-requests";
import { createTestDb } from "../src/trpc/router/pull-requests/shared/test-db";
import { seedProject, seedWorkspace } from "./helpers/seed";

function setup(revparseHead: () => Promise<string>) {
	const db = createTestDb();
	const worktreePath = "/tmp/pr-sync-worktree";
	const project = seedProject({ db }, { repoPath: "/tmp/pr-sync-repo" });
	seedWorkspace(
		{ db },
		{
			projectId: project.id,
			worktreePath,
			branch: "stale-branch",
			headSha: "stale-sha",
		},
	);
	const git = mock(async () => ({
		raw: mock(async (args: string[]) => {
			if (args[0] === "symbolic-ref") return "feature/unborn\n";
			throw new Error(`Unexpected raw args: ${args.join(" ")}`);
		}),
		revparse: mock(async (args: string[]) => {
			if (args[0] === "HEAD") return revparseHead();
			throw new Error(`Unexpected revparse args: ${args.join(" ")}`);
		}),
	}));
	const manager = new PullRequestRuntimeManager({
		db,
		git: git as never,
		github: async () => ({}) as never,
		gitWatcher: { onChanged: () => () => {} } as never,
		// Fixture paths are fabricated; open the missing-dir gate.
		worktreeExists: () => true,
	});
	const refreshRepository = mock(async () => undefined);
	(
		manager as unknown as { refreshRepository: typeof refreshRepository }
	).refreshRepository = refreshRepository;
	const sweep = () =>
		(
			manager as unknown as { syncWorkspaceBranches: () => Promise<void> }
		).syncWorkspaceBranches();
	return { db, git, worktreePath, project, refreshRepository, sweep };
}

describe("PullRequestRuntimeManager branch sync", () => {
	test("persists unborn branches even when HEAD has no commit", async () => {
		const { db, git, worktreePath, project, refreshRepository, sweep } = setup(
			async () => {
				throw new Error("fatal: ambiguous argument 'HEAD'");
			},
		);

		await sweep();

		expect(git.mock.calls[0]?.[0]).toBe(worktreePath);
		expect(db.select().from(workspaceRepositories).get()).toMatchObject({
			branch: "feature/unborn",
			headSha: null,
			upstreamOwner: null,
			upstreamRepo: null,
			upstreamBranch: null,
			pullRequestId: null,
		});
		expect(db.select().from(workspaces).get()?.branch).toBe("feature/unborn");
		expect(refreshRepository.mock.calls[0]?.[0]).toBe(project.repositoryId);
	});

	test("logs and skips unexpected HEAD lookup failures", async () => {
		const { db, refreshRepository, sweep } = setup(async () => {
			throw new Error("fatal: permission denied");
		});
		const warnSpy = spyOn(console, "warn").mockImplementation(() => {});
		try {
			await sweep();

			expect(db.select().from(workspaceRepositories).get()).toMatchObject({
				branch: "stale-branch",
				headSha: "stale-sha",
			});
			expect(refreshRepository).not.toHaveBeenCalled();
			expect(warnSpy.mock.calls[0]?.[0]).toContain(
				"Failed to sync checkout branch",
			);
		} finally {
			warnSpy.mockRestore();
		}
	});
});
