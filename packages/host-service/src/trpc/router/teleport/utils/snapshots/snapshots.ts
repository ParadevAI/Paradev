import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import type { HostDb } from "../../../../../db";
import { listProjectRepositories } from "../../../../../projects/repositories";
import {
	createGitEnvResolver,
	gitCeilingEnv,
} from "../../../../../runtime/git";
import type { WorkerTaskDefinition } from "../../../../../workers/define-worker-task";
import { getHostWorkerPool } from "../../../../../workers/host-worker-pool";
import {
	gitDeleteSnapshotTask,
	gitPushSnapshotTask,
	gitSnapshotRemoteTask,
} from "../../../../../workers/tasks/git";
import { listWorkspaceCheckouts } from "../../../../../workspaces/checkouts";
import { getLocalWorkspace } from "../../../../../workspaces/local-workspace-store";
import { rethrowEnvironmentalGitError } from "../../../git/utils/classify-git-error";
import { resolveCheckoutPath } from "../../../git/utils/resolve-worktree";

export type RunTask = <TInput, TResult>(
	def: WorkerTaskDefinition<TInput, TResult>,
	input: TInput,
	options?: { timeoutMs?: number },
) => Promise<TResult>;

const poolRun: RunTask = (def, input, options) =>
	getHostWorkerPool().run(def, input, options);

export interface SnapshotTarget {
	/** Null for a project-less session workspace. */
	repositoryId: string | null;
	name: string;
	worktreePath: string;
	gitEnv: Record<string, string>;
	remote: string;
	repositoryFullName: string;
}

/** Every checkout the move snapshots, each with its GitHub remote; refuses before anything is pushed. */
export async function resolveSnapshotTargets(
	ctx: {
		db: HostDb;
		credentials: Parameters<typeof createGitEnvResolver>[0];
	},
	workspaceId: string,
	run: RunTask = poolRun,
): Promise<SnapshotTarget[]> {
	const workspace = getLocalWorkspace(ctx.db, workspaceId);
	const checkouts = workspace ? listWorkspaceCheckouts(ctx.db, workspace) : [];
	const multiRepoProject =
		workspace?.projectId != null &&
		listProjectRepositories(ctx.db, workspace.projectId).length > 1;
	const entries =
		checkouts.length > 1
			? checkouts.map((checkout) => {
					resolveCheckoutPath(ctx, workspaceId, checkout.repository.id);
					return {
						repositoryId: checkout.repository.id,
						name: checkout.repository.name,
						path: checkout.path,
						remoteName: checkout.repository.remoteName,
					};
				})
			: [resolveCheckoutPath(ctx, workspaceId)].map((checkout) => ({
					repositoryId: checkout.repository?.id ?? null,
					name: checkout.repository?.name ?? "",
					path: checkout.path,
					remoteName: multiRepoProject
						? (checkout.repository?.remoteName ?? null)
						: null,
				}));
	const resolveEnv = createGitEnvResolver(ctx.credentials);
	const targets = await Promise.all(
		entries.map(async (entry) => {
			const gitEnv = {
				...(await resolveEnv(entry.path)),
				...gitCeilingEnv(entry.path),
			};
			const target = await run(gitSnapshotRemoteTask, {
				worktreePath: entry.path,
				gitEnv,
				preferred: entry.remoteName,
			}).catch((error: unknown) => {
				rethrowEnvironmentalGitError(error);
				throw error;
			});
			const remotes = (target?.pushUrls ?? []).map(parseGitHubRemote);
			const github = remotes[0];
			if (!target || !github || remotes.some((remote) => !remote)) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message:
						entries.length > 1
							? `Moving a workspace needs a GitHub repository: ${entry.name} has none`
							: "Moving a workspace needs a GitHub repository",
				});
			}
			return {
				repositoryId: entry.repositoryId,
				name: entry.name,
				worktreePath: entry.path,
				gitEnv,
				remote: target.remote,
				repositoryFullName: `${github.owner}/${github.name}`,
			};
		}),
	);
	assertDistinctRepositories(targets);
	return targets;
}

/** Two folders cloned from one GitHub repository would race for the same branch on the same remote. */
export function assertDistinctRepositories(targets: SnapshotTarget[]) {
	const seen = new Map<string, string>();
	for (const target of targets) {
		const key = target.repositoryFullName.toLowerCase();
		const other = seen.get(key);
		if (other !== undefined) {
			throw new TRPCError({
				code: "PRECONDITION_FAILED",
				message: `${other} and ${target.name} are both ${target.repositoryFullName}; a workspace with two checkouts of one GitHub repository cannot be moved`,
			});
		}
		seen.set(key, target.name);
	}
}

/** Best effort: a delete that fails is logged, since the branch then stays on the remote. */
export async function deleteSnapshots(
	targets: SnapshotTarget[],
	branch: string,
	run: RunTask = poolRun,
) {
	const results = await Promise.allSettled(
		targets.map((target) =>
			run(gitDeleteSnapshotTask, {
				worktreePath: target.worktreePath,
				remote: target.remote,
				branch,
				gitEnv: target.gitEnv,
			}),
		),
	);
	results.forEach((result, index) => {
		if (result.status === "rejected") {
			console.warn(
				`[teleport] could not delete ${branch} from ${targets[index]?.name || "the remote"}`,
				result.reason,
			);
		}
	});
}

/** Pushes every checkout to `branch`; all or nothing, so a failure deletes the branch everywhere. */
export async function pushSnapshots(
	targets: SnapshotTarget[],
	branch: string,
	run: RunTask = poolRun,
) {
	const results = await Promise.allSettled(
		targets.map((target) =>
			run(
				gitPushSnapshotTask,
				{
					worktreePath: target.worktreePath,
					remote: target.remote,
					branch,
					gitEnv: target.gitEnv,
				},
				{ timeoutMs: 150_000 },
			),
		),
	);
	const failedAt = results.findIndex((result) => result.status === "rejected");
	if (failedAt === -1) {
		return targets.map((target, index) => ({
			repositoryId: target.repositoryId,
			name: target.name,
			repositoryFullName: target.repositoryFullName,
			remoteName: target.remote,
			commit: (results[index] as PromiseFulfilledResult<{ commit: string }>)
				.value.commit,
		}));
	}
	// A push reported as failed (a timeout, a dropped connection) can still have landed.
	await deleteSnapshots(targets, branch, run);
	const error = (results[failedAt] as PromiseRejectedResult).reason;
	if (targets.length === 1) {
		rethrowEnvironmentalGitError(error);
		throw error;
	}
	const name = targets[failedAt]?.name;
	try {
		rethrowEnvironmentalGitError(error);
	} catch (classified) {
		if (classified instanceof TRPCError) {
			throw new TRPCError({
				code: classified.code,
				message: `${name}: ${classified.message}`,
				cause: classified.cause ?? error,
			});
		}
		throw classified;
	}
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `Could not push ${name}: ${error instanceof Error ? error.message : String(error)}`,
		cause: error,
	});
}
