import { describe, expect, mock, test } from "bun:test";
import { workspaceRepositories } from "../src/db/schema";
import { PullRequestRuntimeManager } from "../src/runtime/pull-requests/pull-requests";
import { createTestDb } from "../src/trpc/router/pull-requests/shared/test-db";
import { seedProject, seedWorkspace } from "./helpers/seed";

/**
 * Pins the cost of the **safety-net sweep** that runs every
 * `SAFETY_NET_INTERVAL_MS` (5 min) — the long-cadence backup for the
 * event-driven `GitWatcher` subscription. When `syncWorkspaceBranches`
 * runs, it still walks every workspace and spawns ~5 git subprocesses
 * for each one. The fix from finding #1 doesn't change the safety-net
 * sweep's cost; it only ensures that path runs at 5 min instead of 30 s.
 *
 * The steady-state idle behavior — zero git ops when nothing changed in
 * any `.git/` directory — is covered by
 * `pull-requests-scaling.integration.test.ts`.
 */

interface RawCallLog {
	worktreePath: string;
	args: string[];
}

function buildGitMock(rawCalls: RawCallLog[], worktreePath: string) {
	const recordingRaw = mock(async (args: string[]) => {
		rawCalls.push({ worktreePath, args });

		// symbolic-ref --short HEAD → branch name
		if (args[0] === "symbolic-ref") return "main\n";

		// rev-parse --abbrev-ref BRANCH@{push} → push ref
		if (args[0] === "rev-parse" && args[1] === "--abbrev-ref") {
			return "origin/main\n";
		}

		// remote get-url <name>
		if (args[0] === "remote" && args[1] === "get-url") {
			return "https://github.com/acme/repo.git\n";
		}

		// config --get <key>
		if (args[0] === "config") {
			return "";
		}

		throw new Error(`Unexpected raw args: ${args.join(" ")}`);
	});

	return {
		raw: recordingRaw,
		revparse: mock(async (args: string[]) => {
			rawCalls.push({ worktreePath, args: ["revparse", ...args] });
			if (args[0] === "HEAD") return "deadbeef\n";
			throw new Error(`Unexpected revparse args: ${args.join(" ")}`);
		}),
		remote: mock(async (args: string[]) => {
			rawCalls.push({ worktreePath, args: ["remote", ...args] });
			if (args[0] === "get-url") return "https://github.com/acme/repo.git\n";
			throw new Error(`Unexpected remote args: ${args.join(" ")}`);
		}),
	};
}

async function runSync(workspaceCount: number) {
	const db = createTestDb();
	for (let i = 0; i < workspaceCount; i++) {
		const project = seedProject({ db }, { repoPath: `/tmp/repo-${i}` });
		// Match what the git mock returns so the sweep sees every checkout as
		// unchanged: the steady state still pays full git cost per tick.
		seedWorkspace(
			{ db },
			{
				projectId: project.id,
				worktreePath: `/tmp/worktree-${i}`,
				branch: "main",
				headSha: "deadbeef",
				upstreamOwner: "acme",
				upstreamRepo: "repo",
				upstreamBranch: "main",
			},
		);
	}
	const before = db.select().from(workspaceRepositories).all();

	const rawCalls: RawCallLog[] = [];
	const gitFactoryCalls: string[] = [];
	const git = mock(async (worktreePath: string) => {
		gitFactoryCalls.push(worktreePath);
		return buildGitMock(rawCalls, worktreePath);
	});

	const manager = new PullRequestRuntimeManager({
		db,
		git: git as never,
		github: async () => ({}) as never,
		gitWatcher: { onChanged: () => () => {} } as never,
		// Fixture worktree paths are fabricated; open the missing-dir gate
		// so the scaling assertions still count real git-factory calls.
		worktreeExists: () => true,
	});
	const refreshRepository = mock(async () => undefined);
	(
		manager as unknown as { refreshRepository: typeof refreshRepository }
	).refreshRepository = refreshRepository;

	await (
		manager as unknown as { syncWorkspaceBranches: () => Promise<void> }
	).syncWorkspaceBranches();

	expect(db.select().from(workspaceRepositories).all()).toEqual(before);
	expect(refreshRepository).not.toHaveBeenCalled();
	return { rawCalls, gitFactoryCalls };
}

describe("syncWorkspaceBranches safety-net sweep — worktree-scaling", () => {
	test("git subprocess count grows linearly with workspace count", async () => {
		const small = await runSync(2);
		const large = await runSync(20);

		// One git factory invocation per workspace per tick
		expect(small.gitFactoryCalls.length).toBe(2);
		expect(large.gitFactoryCalls.length).toBe(20);

		// Each workspace issues the same fixed number of git ops on an unchanged
		// repo (branch lookup + HEAD + push-ref + remote URL). The exact count
		// is implementation-defined; what we assert is *linearity*: the cost
		// for 20 workspaces is 10× the cost for 2.
		const perWorkspaceSmall = small.rawCalls.length / 2;
		const perWorkspaceLarge = large.rawCalls.length / 20;
		expect(perWorkspaceSmall).toBe(perWorkspaceLarge);

		// Per-workspace cost is non-trivial — at least a branch lookup, HEAD,
		// and push-ref resolution. If this drops below 3 the runtime probably
		// dropped some git work and this scaling concern is partially fixed.
		expect(perWorkspaceSmall).toBeGreaterThanOrEqual(3);

		// Print the actual per-tick cost so the test output documents the
		// scaling factor for future readers.
		console.log(
			`[scaling] per-tick git ops: 2 workspaces=${small.rawCalls.length}, 20 workspaces=${large.rawCalls.length}, per-workspace=${perWorkspaceSmall}`,
		);
	});

	test("safety-net sweep calls all N git factories even when zero workspaces changed", async () => {
		// The safety-net sweep still walks every workspace — that's its job.
		// What changed in finding #1 is the **cadence**: this used to fire every
		// 30s; now it fires every 5 min, and the steady-state per-workspace
		// sync runs only on real `.git/` activity.
		const { gitFactoryCalls, rawCalls } = await runSync(10);

		expect(gitFactoryCalls.length).toBe(10);
		expect(new Set(gitFactoryCalls).size).toBe(10);
		expect(rawCalls.length).toBeGreaterThanOrEqual(30); // ≥3 ops × 10 workspaces

		// Each workspace got its share of the work — no batching, no shortcut.
		const callsByWorktree = new Map<string, number>();
		for (const call of rawCalls) {
			callsByWorktree.set(
				call.worktreePath,
				(callsByWorktree.get(call.worktreePath) ?? 0) + 1,
			);
		}
		expect(callsByWorktree.size).toBe(10);
		for (const count of callsByWorktree.values()) {
			expect(count).toBeGreaterThanOrEqual(3);
		}
	});
});
