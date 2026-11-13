import { parseGitHubRemote } from "@superset/shared/github-remote";
import { TRPCError } from "@trpc/server";
import type { HostDb } from "../../../../../db";
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
					remoteName: checkout.repository?.remoteName ?? null,
				}));
	const resolveEnv = createGitEnvResolver(ctx.credentials);
	return Promise.all(
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
}

/** Pushes every checkout to `branch`; all or nothing, so a failure deletes the branches already pushed. */
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
	await Promise.allSettled(
		targets.map((target, index) =>
			results[index]?.status === "fulfilled"
				? run(gitDeleteSnapshotTask, {
						worktreePath: target.worktreePath,
						remote: target.remote,
						branch,
						gitEnv: target.gitEnv,
					})
				: Promise.resolve(),
		),
	);
	const error = (results[failedAt] as PromiseRejectedResult).reason;
	rethrowEnvironmentalGitError(error);
	if (targets.length === 1) throw error;
	throw new TRPCError({
		code: "INTERNAL_SERVER_ERROR",
		message: `Could not push ${targets[failedAt]?.name}: ${error instanceof Error ? error.message : String(error)}`,
		cause: error,
	});
}
