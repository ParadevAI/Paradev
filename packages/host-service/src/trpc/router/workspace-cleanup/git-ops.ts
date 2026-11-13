// Off-loop git operations for the workspace-delete saga. Env resolution
// stays on the event loop (it needs the credential provider); the git
// subprocesses — status preflight, `worktree remove` (a recursive delete
// of the whole worktree), branch delete — run in the host worker pool.
//
// Exported as a mutable object: the unit tests patch these methods per
// test and restore them (bun's mock.module leaks across test files in the
// same process, so a module mock would poison the integration suite).

import { createGitEnvResolver } from "../../../runtime/git/git";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	type GitTaskEnv,
	gitDeleteBranchTask,
	gitWorktreeRemoveTask,
	gitWorktreeStateTask,
} from "../../../workers/tasks/git";
import {
	WorkerTaskAbortedError,
	WorkerTaskError,
} from "../../../workers/WorkerTaskRunner";

/**
 * Pool-infrastructure failure (timeout, queue rejection, abort) — the git
 * result is UNKNOWN, unlike a git error thrown by the task handler itself
 * (whose original `name` — e.g. GitError — is preserved across the worker
 * boundary). The destroy preflight fails closed on these instead of
 * proceeding without its dirty-worktree check.
 */
export function isIndeterminateGitTaskFailure(err: unknown): boolean {
	if (err instanceof WorkerTaskAbortedError) return true;
	return err instanceof WorkerTaskError && err.name === "WorkerTaskError";
}

/** The delete dialog waits on this read. */
export const INSPECT_WORKTREE_STATE_TIMEOUT_MS = 15_000;

/** Runs after the row is archived, so nobody waits on it. */
export const DESTROY_WORKTREE_STATE_TIMEOUT_MS = 10 * 60_000;

/** A timeout kills git mid-delete, so this only stops a hung removal. */
export const WORKTREE_REMOVE_TIMEOUT_MS = 30 * 60_000;

/** Long delete tasks must not take every shared worker slot from status and diff reads. */
export const MAX_CONCURRENT_LONG_DELETE_TASKS = 2;

let activeLongDeleteTasks = 0;
const queuedLongDeleteTasks: Array<() => void> = [];

async function withLongDeleteTaskSlot<T>(run: () => Promise<T>): Promise<T> {
	if (activeLongDeleteTasks < MAX_CONCURRENT_LONG_DELETE_TASKS) {
		activeLongDeleteTasks++;
	} else {
		await new Promise<void>((resolve) => queuedLongDeleteTasks.push(resolve));
	}
	try {
		return await run();
	} finally {
		const next = queuedLongDeleteTasks.shift();
		if (next) next();
		else activeLongDeleteTasks--;
	}
}

export const cleanupGitOps = {
	/** Same failure surface as `ctx.git(repoPath)` — a throw here maps to the
	 * saga's "failed to open project repo" handling. */
	resolveGitEnv(
		ctx: Pick<HostServiceContext, "credentials">,
		repoPath: string,
	): Promise<GitTaskEnv> {
		return createGitEnvResolver(ctx.credentials)(repoPath);
	},

	readWorktreeState(
		input: {
			worktreePath: string;
			gitEnv: GitTaskEnv;
			ignoreInitialCommit?: boolean;
		},
		options: { timeoutMs: number; signal?: AbortSignal },
	): Promise<{ hasChanges: boolean; hasUnpushedCommits: boolean }> {
		return getHostWorkerPool().run(gitWorktreeStateTask, input, options);
	},

	/** For a caller that does not wait on the answer (no dialog, no relay). */
	readWorktreeStateUnattended(input: {
		worktreePath: string;
		gitEnv: GitTaskEnv;
	}): Promise<{ hasChanges: boolean; hasUnpushedCommits: boolean }> {
		return withLongDeleteTaskSlot(() =>
			getHostWorkerPool().run(gitWorktreeStateTask, input, {
				timeoutMs: DESTROY_WORKTREE_STATE_TIMEOUT_MS,
			}),
		);
	},

	removeWorktree(input: {
		repoPath: string;
		worktreePath: string;
		gitEnv: GitTaskEnv;
		force?: boolean;
	}): Promise<{ stillRegistered: boolean; removeError?: string }> {
		return withLongDeleteTaskSlot(() =>
			getHostWorkerPool().run(gitWorktreeRemoveTask, input, {
				timeoutMs: WORKTREE_REMOVE_TIMEOUT_MS,
			}),
		);
	},

	deleteLocalBranch(input: {
		repoPath: string;
		branch: string;
		gitEnv: GitTaskEnv;
	}): Promise<{ deleted: boolean }> {
		return getHostWorkerPool().run(gitDeleteBranchTask, input);
	},
};
