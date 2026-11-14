import { rm } from "node:fs/promises";
import { join } from "node:path";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import type { SimpleGit } from "simple-git";
import { z } from "zod";
import type { HostDb } from "../../../db";
import {
	pullRequests,
	workspaceRepositories,
	workspaces,
} from "../../../db/schema";
import { listProjectRepositories } from "../../../projects/repositories";
import { createGitEnvResolver, gitCeilingEnv } from "../../../runtime/git";
import { createUserSimpleGit } from "../../../runtime/git/simple-git";
import type { HostServiceContext } from "../../../types";
import { getHostWorkerPool } from "../../../workers/host-worker-pool";
import {
	gitCheckoutBranchTask,
	gitCommitFilesTask,
	gitCommitTask,
	gitDiffBulkTask,
	gitDiffPatchTask,
	gitDiffSideBlobTask,
	gitFetchBaseRefTask,
	gitFetchBranchesTask,
	gitPushTask,
	gitStagePathsTask,
	gitStatusPartialTask,
	gitStatusSnapshotTask,
} from "../../../workers/tasks/git";
import {
	followSharedCheckoutBranch,
	listCheckoutsByWorkspaceId,
	type ResolvedCheckout,
	resolveCheckout,
} from "../../../workspaces/checkouts";
import {
	emitLocalWorkspaceUpdated,
	getLocalWorkspace,
	updateLocalWorkspace,
} from "../../../workspaces/local-workspace-store";
import { keepWorkspaceBranch } from "../../../workspaces/workspace-naming-state";
import {
	cancelAndWaitWorkspaceTitleCommit,
	cancelWorkspaceTitleJob,
} from "../../../workspaces/workspace-title-jobs";
import { protectedProcedure, queryProcedure, router } from "../../index";
import { rethrowWorkerTaskAbort } from "../../worker-abort";
import { resolveGithubRepo } from "../workspace-creation/shared/project-helpers";
import { syncWorkspaceContextFiles } from "../workspace-creation/shared/workspace-context-files";
import type {
	ChangedFile,
	CheckConclusionState,
	CheckRun,
	CheckStatusState,
	Commit,
	IssueComment,
	MergeableState,
	PullRequestReviewDecision,
	PullRequestReviewThread,
	PullRequestState,
} from "./types";
import { scheduleBaseRefFetch } from "./utils/base-ref-freshness";
import { rethrowEnvironmentalGitError } from "./utils/classify-git-error";
import { gitConfigWrite } from "./utils/config-write";
import {
	assertSafeRelativePath,
	getDefaultBranchName,
	loadFileDiffContent,
	resolveBaseComparison,
	resolveDiffCategoryRefs,
} from "./utils/git-helpers";
import { gitStatusRefreshLimiter } from "./utils/git-status-refresh-limiter";
import {
	checkoutStatusKey,
	gitStatusStore,
	parseCheckoutStatusKey,
} from "./utils/git-status-store";
import {
	type GraphQLThreadsResult,
	parseGraphQLThreads,
	REVIEW_THREADS_QUERY,
} from "./utils/graphql";
import { replyToReviewComment } from "./utils/reply-to-review-comment";
import { resolveCheckoutPath } from "./utils/resolve-worktree";
import { attachSpawnFailureDiagnostics } from "./utils/spawn-failure-diagnostics";

// Front-door cap for commit-file diffs. Statuses are admitted by
// gitStatusRefreshLimiter; without a cap here, a burst of distinct-commit
// diffs could occupy every pool worker ahead of limiter-admitted statuses.
const MAX_CONCURRENT_COMMIT_FILE_TASKS = 2;
let activeCommitFileTasks = 0;
const commitFileWaiters: (() => void)[] = [];
async function withCommitFilesSlot<T>(fn: () => Promise<T>): Promise<T> {
	if (activeCommitFileTasks >= MAX_CONCURRENT_COMMIT_FILE_TASKS) {
		await new Promise<void>((resolve) => commitFileWaiters.push(resolve));
	}
	activeCommitFileTasks++;
	try {
		return await fn();
	} finally {
		activeCommitFileTasks--;
		commitFileWaiters.shift()?.();
	}
}

// Identical requests share one slot AND one task — deduping outside the
// semaphore keeps same-commit bursts from consuming both cap slots or
// re-running a task that finished while they waited for a slot.
const inFlightCommitFiles = new Map<string, Promise<ChangedFile[]>>();
function runCommitFilesDeduped(
	key: string,
	fn: () => Promise<ChangedFile[]>,
): Promise<ChangedFile[]> {
	const existing = inFlightCommitFiles.get(key);
	if (existing) return existing;
	const task = withCommitFilesSlot(fn).finally(() => {
		inFlightCommitFiles.delete(key);
	});
	inFlightCommitFiles.set(key, task);
	return task;
}

/** Credential env for a worker git task, resolved in-process (the provider
 * can't cross the thread boundary) and passed to the worker as plain data. */
async function resolveGitTaskEnv(
	ctx: Pick<HostServiceContext, "credentials">,
	checkoutPath: string,
): Promise<Record<string, string>> {
	return {
		...(await createGitEnvResolver(ctx.credentials)(checkoutPath)),
		...gitCeilingEnv(checkoutPath),
	};
}

type GitCtx = Pick<HostServiceContext, "db" | "git" | "credentials">;

const checkoutInput = {
	workspaceId: z.string(),
	repositoryId: z.string().optional(),
};

interface OpenCheckout extends ResolvedCheckout {
	repositoryId: string | null;
	statusKey: string;
}

function openCheckout(
	ctx: Pick<HostServiceContext, "db">,
	input: { workspaceId: string; repositoryId?: string },
): OpenCheckout {
	const checkout = resolveCheckoutPath(
		ctx,
		input.workspaceId,
		input.repositoryId,
	);
	const repositoryId = checkout.repository?.id ?? null;
	return {
		...checkout,
		repositoryId,
		statusKey: checkoutStatusKey(input.workspaceId, repositoryId),
	};
}

function checkoutGit(ctx: GitCtx, checkoutPath: string): Promise<SimpleGit> {
	return ctx.git(checkoutPath, { env: gitCeilingEnv(checkoutPath) });
}

/** The checkout's linked PR row, or null; no disk access. */
function getCheckoutPullRequest(
	db: HostDb,
	input: { workspaceId: string; repositoryId?: string },
): { checkout: ResolvedCheckout; pr: typeof pullRequests.$inferSelect | null } {
	const checkout = resolveCheckout(db, input.workspaceId, input.repositoryId);
	const pullRequestId = checkout.row?.pullRequestId;
	if (!pullRequestId) return { checkout, pr: null };
	const pr = db.query.pullRequests
		.findFirst({ where: eq(pullRequests.id, pullRequestId) })
		.sync();
	if (!pr) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: `Pull request ${pullRequestId} not found in database`,
		});
	}
	return { checkout, pr };
}

/** Delete for a discard. Recursive because an untracked or staged-as-added
 * path can be a directory (an embedded git repository is reported as one
 * entry, never expanded into files), and confined to the worktree because
 * assertSafeRelativePath runs on the caller-relative path first. */
async function removeFromWorktree(
	worktreePath: string,
	relativePath: string,
): Promise<void> {
	assertSafeRelativePath(relativePath);
	await rm(join(worktreePath, relativePath), { recursive: true, force: true });
}

/** Upper bound for one getDiffStatsByWorkspaces call — a page's host rarely
 * has more than a few dozen workspaces; anything larger is a runaway caller. */
export const MAX_DIFF_STATS_BATCH = 500;

/**
 * A mutation that rewrites the index or refs returns before the `.git/`
 * watcher event flushes, and the client refetches status immediately. Mark
 * the checkout for a full walk so that refetch cannot be served from cache.
 */
function invalidateStatus(statusKey: string): void {
	gitStatusStore.recordChange(statusKey, undefined);
}

function emitWorkspaceUpdated(
	ctx: Pick<HostServiceContext, "db" | "eventBus">,
	workspaceId: string,
): void {
	const row = getLocalWorkspace(ctx.db, workspaceId);
	if (row) emitLocalWorkspaceUpdated(ctx, row);
}

// A name git could read as an option (`--upload-pack=...`) never reaches it.
const branchName = z
	.string()
	.min(1)
	.refine((name) => !name.startsWith("-"), "Not a branch name");

const CHECKOUT_REFUSALS = {
	dirty: {
		code: "PRECONDITION_FAILED",
		message: () => "Commit or discard the changes in this workspace first.",
	},
	"held-elsewhere": {
		code: "CONFLICT",
		message: (branch: string) =>
			`${branch} is checked out in another workspace.`,
	},
	"fetch-failed": {
		code: "INTERNAL_SERVER_ERROR",
		message: (branch: string) => `Could not fetch ${branch} from origin.`,
	},
	"not-found": {
		code: "NOT_FOUND",
		message: (branch: string) => `No branch ${branch} here or on origin.`,
	},
} as const;

async function assertBranchNotPushed(
	git: SimpleGit,
	branch: string,
	remoteNames: readonly string[],
): Promise<void> {
	for (const remoteName of new Set(remoteNames)) {
		try {
			const remote = await git.raw([
				"ls-remote",
				"--heads",
				remoteName,
				branch,
			]);
			if (remote.trim()) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cannot rename a branch that has been pushed to remote",
				});
			}
		} catch (error) {
			if (error instanceof TRPCError) throw error;
			// ls-remote failed — probably no remote, safe to rename
		}
	}
}

/** Pushes go to origin; a multi-repo checkout can also push to its repository remote or the branch's upstream. */
async function branchPushRemotes(
	git: SimpleGit,
	branch: string,
	repositoryRemote: string | null,
): Promise<string[]> {
	const tracked = (
		await git
			.raw(["config", "--get", `branch.${branch}.remote`])
			.catch(() => "")
	).trim();
	return ["origin", repositoryRemote, tracked].filter(
		(name): name is string => !!name && name !== ".",
	);
}

/** Limiter-admitted status snapshot of one checkout; shared by getStatus and
 * the batched diff-stats query so both see identical numbers. */
function runStatusSnapshot(
	ctx: Pick<HostServiceContext, "db" | "credentials" | "eventBus">,
	input: {
		workspaceId: string;
		repositoryId?: string;
		baseBranch?: string;
		priority?: "foreground" | "background";
	},
) {
	const checkout = openCheckout(ctx, input);
	const { statusKey } = checkout;
	const worktreePath = checkout.path;
	const baseBranch = input.baseBranch || undefined;
	const requestKey = JSON.stringify({ baseBranch: baseBranch ?? null });
	return gitStatusRefreshLimiter.run({
		workspaceId: statusKey,
		requestKey,
		priority: input.priority,
		run: async () => {
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const workerPool = getHostWorkerPool();

			const computeFull = async () => {
				const snapshotStartedAt = Date.now();
				const result = await workerPool.run(
					gitStatusSnapshotTask,
					{ worktreePath, baseBranch, gitEnv },
					{ timeoutMs: 15_000 },
				);
				if (result.baseRefFetchTarget) {
					const target = result.baseRefFetchTarget;
					const coordinatorGit = createUserSimpleGit(worktreePath, {
						env: gitEnv,
					});
					// The coordinator maps live in this process, not in individual
					// workers, so worktrees sharing one common Git dir share one TTL
					// and in-flight fetch. The network fetch itself remains off-loop.
					void scheduleBaseRefFetch(
						coordinatorGit,
						worktreePath,
						target,
						{ workspaceId: statusKey, snapshotStartedAt },
						() =>
							workerPool.run(
								gitFetchBaseRefTask,
								{ worktreePath, target, gitEnv },
								{
									timeoutMs: 30_000,
									strategy: "coalesce",
									dedupeKey: `${worktreePath}:base-ref:${target.remote}/${target.branch}`,
								},
							),
					).then((staleStatusKeys) => {
						for (const key of staleStatusKeys) {
							invalidateStatus(key);
							const stale = parseCheckoutStatusKey(key);
							ctx.eventBus.broadcastGitChanged(
								stale.workspaceId,
								stale.repositoryId,
							);
						}
					});
				}
				return result.snapshot;
			};

			return gitStatusStore.read({
				workspaceId: statusKey,
				baseBranch: baseBranch ?? null,
				computeFull,
				computePartial: (paths) =>
					workerPool.run(
						gitStatusPartialTask,
						{ worktreePath, paths, gitEnv },
						{ timeoutMs: 15_000 },
					),
			});
		},
	});
}

/** Same union the desktop Changes tab renders: staged/unstaged override the
 * against-base entry for a path, so totals match what the workspace shows. */
function sumSnapshotDiffStats(snapshot: {
	againstBase: ChangedFile[];
	staged: ChangedFile[];
	unstaged: ChangedFile[];
}): { additions: number; deletions: number; fileCount: number } {
	const byPath = new Map<string, ChangedFile>();
	for (const file of snapshot.againstBase) byPath.set(file.path, file);
	for (const file of snapshot.staged) byPath.set(file.path, file);
	for (const file of snapshot.unstaged) byPath.set(file.path, file);
	let additions = 0;
	let deletions = 0;
	for (const file of byPath.values()) {
		additions += file.additions ?? 0;
		deletions += file.deletions ?? 0;
	}
	return { additions, deletions, fileCount: byPath.size };
}

const getDiffInputShape = z.object({
	...checkoutInput,
	path: z.string(),
	category: z.enum(["against-base", "staged", "unstaged", "commit"]),
	baseBranch: z.string().optional(),
	commitHash: z.string().optional(),
	fromHash: z.string().optional(),
});

/** Upper bound on one getDiffBulk call — generous headroom over the largest
 * changeset we expect the Changes pane to render, while still bounding a
 * runaway/malicious request. */
const MAX_DIFF_BULK_PATHS = 2000;
const DIFF_SIDE_FILE_MAX_BYTES = 10 * 1024 * 1024;

// A rename is two index entries (delete of `oldPath`, add of `filePath`);
// staging or unstaging only one end would split it into a delete plus an add.
const stagingTargetInput = z.object({
	...checkoutInput,
	filePath: z.string(),
	oldPath: z.string().optional(),
});

function resolveStagingTargetPaths(
	input: z.infer<typeof stagingTargetInput>,
): string[] {
	assertSafeRelativePath(input.filePath);
	if (input.oldPath == null || input.oldPath === input.filePath) {
		return [input.filePath];
	}
	assertSafeRelativePath(input.oldPath);
	return [input.filePath, input.oldPath];
}

export const gitRouter = router({
	listBranches: queryProcedure
		.input(z.object(checkoutInput))
		.query(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);

			// `%(HEAD)` emits "*" for the checked-out branch, " " otherwise.
			// Single spawn — independent of branch count. Only `name`/`isHead`
			// are read by the v2 sidebar's BaseBranchSelector; the other
			// per-branch fields the previous implementation computed (upstream,
			// ahead/behind, last-commit) cost 4 spawns each and were unused.
			let branches: { name: string; isHead: boolean }[] = [];
			try {
				const raw = await git.raw([
					"for-each-ref",
					"refs/heads/",
					"--format=%(HEAD)\t%(refname:short)",
				]);
				branches = raw
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => {
						const tab = line.indexOf("\t");
						if (tab < 0) return { name: line, isHead: false };
						return {
							isHead: line.slice(0, tab) === "*",
							name: line.slice(tab + 1),
						};
					});
			} catch {}

			return { branches };
		}),

	getStatus: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				...checkoutInput,
				baseBranch: z.string().optional(),
				priority: z.enum(["foreground", "background"]).optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			try {
				return await runStatusSnapshot(ctx, input);
			} catch (error) {
				// A pane closing mid-request aborts the task; that is the client
				// leaving, not a status failure.
				rethrowWorkerTaskAbort(error);
				// The worker boundary strips prototypes, so a simple-git failure
				// arrives as a plain error — classify it by message here. The
				// checkout can vanish between resolveCheckoutPath's existence
				// check and the git spawn.
				rethrowEnvironmentalGitError(error);
				// A spawn that never produced a process reports with no
				// first-party frame and no reason; record the descriptor table
				// while we are still standing in the failure.
				attachSpawnFailureDiagnostics(error);
				throw error;
			}
		}),

	// One request per host for list/board surfaces — totals only, so a
	// 30-workspace page never fans out 30 getStatus calls from the client.
	// The batch is bounded so one RPC can't queue unbounded background work;
	// callers slice to this cap (see useAccessibleV2Workspaces).
	getDiffStatsByWorkspaces: queryProcedure
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({ workspaceIds: z.array(z.string()).max(MAX_DIFF_STATS_BATCH) }),
		)
		.query(async ({ ctx, input }) => {
			const queue = [...input.workspaceIds];
			const rows = input.workspaceIds.length
				? ctx.db
						.select({
							id: workspaces.id,
							worktreePath: workspaces.worktreePath,
							projectId: workspaces.projectId,
						})
						.from(workspaces)
						.where(inArray(workspaces.id, input.workspaceIds))
						.all()
				: [];
			const checkoutsByWorkspace = listCheckoutsByWorkspaceId(ctx.db, rows);
			const sessionIds = new Set(
				rows.filter((row) => row.projectId === null).map((row) => row.id),
			);
			const result: {
				workspaceId: string;
				checkouts: {
					repositoryId: string | null;
					additions: number;
					deletions: number;
					fileCount: number;
				}[];
			}[] = [];
			// Small local cap; each status is additionally admitted by
			// gitStatusRefreshLimiter at background priority, so this batch can
			// never crowd out a foreground Changes-tab refresh.
			const workers = Array.from(
				{ length: Math.min(4, queue.length) },
				async () => {
					for (
						let workspaceId = queue.shift();
						workspaceId !== undefined;
						workspaceId = queue.shift()
					) {
						const repositoryIds: (string | null)[] =
							checkoutsByWorkspace
								.get(workspaceId)
								?.map((checkout) => checkout.repository.id) ??
							(sessionIds.has(workspaceId) ? [null] : []);
						const checkouts: (typeof result)[number]["checkouts"] = [];
						for (const repositoryId of repositoryIds) {
							try {
								const stats = sumSnapshotDiffStats(
									await runStatusSnapshot(ctx, {
										workspaceId,
										repositoryId: repositoryId ?? undefined,
										priority: "background",
									}),
								);
								checkouts.push({ repositoryId, ...stats });
							} catch {
								// Missing worktree, wedged repo, etc. — omit it rather
								// than failing the whole batch.
							}
						}
						if (checkouts.length > 0) result.push({ workspaceId, checkouts });
					}
				},
			);
			await Promise.all(workers);
			return { workspaces: result };
		}),

	listCommits: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			z.object({
				...checkoutInput,
				baseBranch: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);

			const base = await resolveBaseComparison(git, input.baseBranch);
			const baseRef = base?.baseRef ?? "HEAD";

			const commits: Commit[] = [];
			try {
				const raw = await git.raw([
					"log",
					`${baseRef}..HEAD`,
					"--format=%H\t%h\t%s\t%an\t%ae\t%aI",
				]);
				for (const line of raw.trim().split("\n")) {
					if (!line) continue;
					const [hash, shortHash, message, author, authorEmail, date] =
						line.split("\t");
					commits.push({
						hash: hash ?? "",
						shortHash: shortHash ?? "",
						message: message ?? "",
						author: author ?? "",
						authorEmail: authorEmail ?? "",
						date: date ?? "",
					});
				}
			} catch {}

			return { commits };
		}),

	getCommitFiles: queryProcedure
		.meta({ timeoutMs: 15_000 })
		.input(
			z.object({
				...checkoutInput,
				commitHash: z.string(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const dedupeKey = `${checkout.statusKey}:commit-files:${input.fromHash ?? ""}:${input.commitHash}`;
			const files = await runCommitFilesDeduped(dedupeKey, () =>
				getHostWorkerPool().run(
					gitCommitFilesTask,
					{
						worktreePath,
						commitHash: input.commitHash,
						fromHash: input.fromHash,
						gitEnv,
					},
					{
						timeoutMs: 15_000,
						strategy: "coalesce",
						dedupeKey,
					},
				),
			);

			return { files };
		}),

	getBaseBranch: queryProcedure
		.input(z.object(checkoutInput))
		.query(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			if (!currentBranch || currentBranch === "HEAD") {
				return { baseBranch: null as string | null };
			}
			const configured = (
				await git
					.raw(["config", `branch.${currentBranch}.base`])
					.catch(() => "")
			).trim();
			return { baseBranch: (configured || null) as string | null };
		}),

	setBaseBranch: protectedProcedure
		.input(
			z.object({
				...checkoutInput,
				baseBranch: z.string().nullable(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			if (!currentBranch || currentBranch === "HEAD") {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cannot set base branch on detached HEAD",
				});
			}
			if (input.baseBranch) {
				await gitConfigWrite(git, [
					"config",
					`branch.${currentBranch}.base`,
					input.baseBranch,
				]);
			} else {
				await gitConfigWrite(git, [
					"config",
					"--unset",
					`branch.${currentBranch}.base`,
				]).catch(() => {});
			}
			return { baseBranch: input.baseBranch };
		}),

	renameBranch: protectedProcedure
		.input(
			z.object({
				...checkoutInput,
				oldName: z.string(),
				newName: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await cancelAndWaitWorkspaceTitleCommit(ctx.db, input.workspaceId);
			const checkout = openCheckout(ctx, input);
			const git = await checkoutGit(ctx, checkout.path);
			// Background naming may have renamed the branch after the caller
			// read it. Only then does the caller's name no longer exist, and
			// the row holds the branch the checkout has now.
			const callerBranchExists =
				(await git.raw(["branch", "--list", input.oldName])).trim() !== "";
			const oldName = callerBranchExists
				? input.oldName
				: (checkout.row?.branch ?? input.oldName);
			const repository = checkout.repository;
			const multiRepoProject =
				repository != null &&
				listProjectRepositories(ctx.db, repository.projectId).length > 1;
			await assertBranchNotPushed(
				git,
				oldName,
				multiRepoProject
					? await branchPushRemotes(git, oldName, repository.remoteName)
					: ["origin"],
			);
			const renamesCheckedOutBranch =
				(await git.raw(["rev-parse", "--abbrev-ref", "HEAD"])).trim() ===
				oldName;
			await git.raw(["branch", "-m", oldName, input.newName]);

			if (checkout.row && renamesCheckedOutBranch) {
				ctx.db
					.update(workspaceRepositories)
					.set({ branch: input.newName })
					.where(
						and(
							eq(workspaceRepositories.workspaceId, input.workspaceId),
							eq(workspaceRepositories.repositoryId, checkout.row.repositoryId),
						),
					)
					.run();
				followSharedCheckoutBranch(ctx.db, input.workspaceId);
				syncWorkspaceContextFiles(ctx.db, input.workspaceId);
				emitWorkspaceUpdated(ctx, input.workspaceId);
			}
			invalidateStatus(checkout.statusKey);
			return { name: input.newName };
		}),

	/**
	 * Moves the workspace onto another branch of its repository. A branch that
	 * only exists on the remote is fetched first; `git switch` then creates the
	 * tracking branch. Refused while the tree is dirty, because the switch
	 * would carry the changes along, and while another worktree holds the
	 * branch, because git allows a branch in one worktree at a time.
	 */
	checkoutBranch: protectedProcedure
		.input(z.object({ ...checkoutInput, branch: branchName }))
		.mutation(async ({ ctx, input }) => {
			await cancelAndWaitWorkspaceTitleCommit(ctx.db, input.workspaceId);
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool()
				.run(
					gitCheckoutBranchTask,
					{ worktreePath, branch: input.branch, gitEnv },
					{ timeoutMs: 120_000 },
				)
				.catch((error: unknown) => {
					rethrowEnvironmentalGitError(error);
					throw error;
				});
			if (!result.ok) {
				const refusal = CHECKOUT_REFUSALS[result.reason];
				throw new TRPCError({
					code: refusal.code,
					message: refusal.message(input.branch),
				});
			}
			if (checkout.row) {
				ctx.db
					.update(workspaceRepositories)
					.set({ branch: input.branch })
					.where(
						and(
							eq(workspaceRepositories.workspaceId, input.workspaceId),
							eq(workspaceRepositories.repositoryId, checkout.row.repositoryId),
						),
					)
					.run();
			}
			const checkoutCount =
				listCheckoutsByWorkspaceId(ctx.db, [checkout.workspace]).get(
					input.workspaceId,
				)?.length ?? 0;
			if (checkoutCount <= 1) {
				updateLocalWorkspace(
					{ db: ctx.db, eventBus: ctx.eventBus, userId: ctx.userId },
					input.workspaceId,
					{ branch: input.branch },
				);
			} else {
				cancelWorkspaceTitleJob(ctx.db, input.workspaceId);
				keepWorkspaceBranch(ctx.db, input.workspaceId);
				followSharedCheckoutBranch(ctx.db, input.workspaceId);
				syncWorkspaceContextFiles(ctx.db, input.workspaceId);
				emitWorkspaceUpdated(ctx, input.workspaceId);
			}
			invalidateStatus(checkout.statusKey);
			return { branch: input.branch };
		}),

	fetchBranches: protectedProcedure
		.input(
			z.object({
				...checkoutInput,
				branches: z.array(branchName).max(20),
				missingOnly: z.boolean().default(false),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool()
				.run(
					gitFetchBranchesTask,
					{
						worktreePath,
						branches: input.branches,
						missingOnly: input.missingOnly,
						gitEnv,
					},
					{ timeoutMs: 120_000 },
				)
				.catch((error: unknown) => {
					rethrowEnvironmentalGitError(error);
					throw error;
				});
			if (result.fetched.length > 0) invalidateStatus(checkout.statusKey);
			return result;
		}),

	discardChanges: protectedProcedure
		.input(
			z.object({
				...checkoutInput,
				filePath: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			assertSafeRelativePath(input.filePath);
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			const status = await git.status();
			const isUntracked = status.not_added.includes(input.filePath);
			if (isUntracked) {
				await removeFromWorktree(worktreePath, input.filePath);
			} else {
				await git.raw(["checkout", "HEAD", "--", input.filePath]);
			}
			invalidateStatus(checkout.statusKey);
			return { success: true };
		}),

	discardAllUnstaged: protectedProcedure
		.input(z.object(checkoutInput))
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			await git.raw(["checkout", "--", "."]);
			await git.raw(["clean", "-fd"]);
			invalidateStatus(checkout.statusKey);
			return { success: true };
		}),

	discardAllStaged: protectedProcedure
		.input(z.object(checkoutInput))
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			const status = await git.status();

			// Files with a staged change (index entry differs from HEAD).
			const stagedFiles = status.files.filter(
				(f) => f.index !== " " && f.index !== "?",
			);

			const checkoutHeadPaths: string[] = [];
			const resetPaths: string[] = [];
			const deletePaths: string[] = [];

			for (const f of stagedFiles) {
				if (f.index === "A") {
					// Staged-as-added: not in HEAD. Unstage + delete.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
				} else if (f.index === "R") {
					// Staged rename: index has both delete-of-old and add-of-new.
					// Unstage both ends, restore old from HEAD, delete new.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
					if (f.from) {
						resetPaths.push(f.from);
						checkoutHeadPaths.push(f.from);
					}
				} else if (f.index === "C") {
					// Staged copy: source unchanged, dest is new in index.
					resetPaths.push(f.path);
					deletePaths.push(f.path);
				} else {
					// M, D, T: exists in HEAD; checkout reverts both index and WT.
					checkoutHeadPaths.push(f.path);
				}
			}

			if (resetPaths.length > 0) {
				await git.raw(["reset", "HEAD", "--", ...resetPaths]);
			}
			if (checkoutHeadPaths.length > 0) {
				await git.raw(["checkout", "HEAD", "--", ...checkoutHeadPaths]);
			}
			for (const filePath of deletePaths) {
				await removeFromWorktree(worktreePath, filePath);
			}
			invalidateStatus(checkout.statusKey);
			return { success: true };
		}),

	stageFile: protectedProcedure
		.input(stagingTargetInput)
		.mutation(async ({ ctx, input }) => {
			const paths = resolveStagingTargetPaths(input);
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool().run(gitStagePathsTask, {
				worktreePath,
				paths,
				action: "stage",
				gitEnv,
			});
			invalidateStatus(checkout.statusKey);
			return result;
		}),

	unstageFile: protectedProcedure
		.input(stagingTargetInput)
		.mutation(async ({ ctx, input }) => {
			const paths = resolveStagingTargetPaths(input);
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool().run(gitStagePathsTask, {
				worktreePath,
				paths,
				action: "unstage",
				gitEnv,
			});
			invalidateStatus(checkout.statusKey);
			return result;
		}),

	stageAll: protectedProcedure
		.input(z.object(checkoutInput))
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			await git.raw(["add", "-A"]);
			invalidateStatus(checkout.statusKey);
			return { success: true };
		}),

	unstageAll: protectedProcedure
		.input(z.object(checkoutInput))
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			await git.raw(["reset", "HEAD"]);
			invalidateStatus(checkout.statusKey);
			return { success: true };
		}),

	commit: protectedProcedure
		// Commit hooks (lint-staged etc.) run here and can be slow.
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({
				...checkoutInput,
				message: z.string().trim().min(1),
				stageAll: z.boolean().default(true),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool().run(
				gitCommitTask,
				{
					worktreePath,
					message: input.message,
					stageAll: input.stageAll,
					gitEnv,
				},
				{ timeoutMs: 60_000 },
			);
			if (!result.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Nothing to commit",
				});
			}
			invalidateStatus(checkout.statusKey);
			return { success: true, hash: result.hash };
		}),

	push: protectedProcedure
		.meta({ timeoutMs: 120_000 })
		.input(z.object(checkoutInput))
		.mutation(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			// The linked PR lookup stays on-loop (sync db reads); the git work
			// itself — upstream resolution and the push — runs in the pool.
			const linkedPullRequestId = checkout.row?.pullRequestId;
			const linkedPr = linkedPullRequestId
				? ctx.db.query.pullRequests
						.findFirst({ where: eq(pullRequests.id, linkedPullRequestId) })
						.sync()
				: null;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			const result = await getHostWorkerPool()
				.run(
					gitPushTask,
					{
						worktreePath,
						linkedPrHeadBranch: linkedPr?.headBranch ?? null,
						gitEnv,
					},
					{ timeoutMs: 120_000 },
				)
				.catch((error: unknown) => {
					// A push the user's hook or the remote refused arrives from the
					// worker as a plain error carrying git's refusal text; the
					// desktop shows that text as-is, so only the classification
					// changes here.
					rethrowEnvironmentalGitError(error);
					throw error;
				});
			if (!result.ok) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						result.reason === "detached-head"
							? "Cannot push with a detached HEAD"
							: "No git remote to push to",
				});
			}
			invalidateStatus(checkout.statusKey);
			return { success: true };
		}),

	getDiff: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(getDiffInputShape)
		.query(async ({ ctx, input }) => {
			assertSafeRelativePath(input.path);
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);
			const refs = await resolveDiffCategoryRefs(git, input.category, input);
			return loadFileDiffContent(
				git,
				worktreePath,
				input.category,
				input.path,
				refs,
			);
		}),

	// One side of a binary file's diff, read from the git object the text
	// diff would compare (index, HEAD, merge-base or a commit) so an image or
	// PDF preview shows the same "before" and "after" as the hunks around it.
	// The unstaged "new" side is the working tree and is not served here;
	// callers read it through `filesystem.readFile`.
	readDiffSideFile: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(
			getDiffInputShape.extend({
				side: z.enum(["old", "new"]),
				maxBytes: z
					.number()
					.int()
					.positive()
					.max(DIFF_SIDE_FILE_MAX_BYTES)
					.optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			assertSafeRelativePath(input.path);
			if (input.category === "unstaged" && input.side === "new") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"The unstaged new side is the working tree, not a git object",
				});
			}
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			return getHostWorkerPool().run(
				gitDiffSideBlobTask,
				{
					worktreePath,
					category: input.category,
					side: input.side,
					path: input.path,
					maxBytes: input.maxBytes ?? DIFF_SIDE_FILE_MAX_BYTES,
					baseBranch: input.baseBranch,
					commitHash: input.commitHash,
					fromHash: input.fromHash,
					gitEnv,
				},
				{ timeoutMs: 30_000 },
			);
		}),

	// Bulk sibling of `getDiff` for callers (the Changes pane) that need every
	// changed file's diff at once. One network round trip instead of one per
	// file, and the shared ref resolution (merge-base, etc.) below runs once
	// for the whole batch instead of once per file. Concurrency is bounded so
	// a several-hundred-file changeset doesn't spawn hundreds of simultaneous
	// `git show` processes.
	getDiffBulk: queryProcedure
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({
				...checkoutInput,
				paths: z.array(z.string()).min(1).max(MAX_DIFF_BULK_PATHS),
				category: z.enum(["against-base", "staged", "unstaged", "commit"]),
				baseBranch: z.string().optional(),
				commitHash: z.string().optional(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			for (const path of input.paths) assertSafeRelativePath(path);
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			// Ref resolution and every file's `git show` pair run inside the
			// worker task, off the host-service event loop — see
			// no-main-loop-blocking.test.ts.
			return getHostWorkerPool().run(
				gitDiffBulkTask,
				{
					worktreePath,
					paths: input.paths,
					category: input.category,
					baseBranch: input.baseBranch,
					commitHash: input.commitHash,
					fromHash: input.fromHash,
					gitEnv,
				},
				{ timeoutMs: 60_000 },
			);
		}),

	// Patch-shaped sibling of `getDiff`: one `git diff` for a whole category
	// instead of two `git show` blobs per file. The renderer parses it into
	// per-file metadata and calls `getDiff` later, only for the files somebody
	// expands or edits — so an untouched changeset never moves whole files.
	getDiffPatch: queryProcedure
		.meta({ timeoutMs: 60_000 })
		.input(
			z.object({
				...checkoutInput,
				category: z.enum(["against-base", "staged", "unstaged", "commit"]),
				paths: z.array(z.string()).max(MAX_DIFF_BULK_PATHS).optional(),
				untrackedPaths: z.array(z.string()).max(MAX_DIFF_BULK_PATHS).optional(),
				baseBranch: z.string().optional(),
				commitHash: z.string().optional(),
				fromHash: z.string().optional(),
			}),
		)
		.query(async ({ ctx, input }) => {
			for (const path of input.paths ?? []) assertSafeRelativePath(path);
			for (const path of input.untrackedPaths ?? [])
				assertSafeRelativePath(path);
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const gitEnv = await resolveGitTaskEnv(ctx, worktreePath);
			return getHostWorkerPool()
				.run(
					gitDiffPatchTask,
					{
						worktreePath,
						category: input.category,
						paths: input.paths,
						untrackedPaths: input.untrackedPaths,
						baseBranch: input.baseBranch,
						commitHash: input.commitHash,
						fromHash: input.fromHash,
						gitEnv,
					},
					{ timeoutMs: 60_000 },
				)
				.catch((error: unknown) => {
					rethrowEnvironmentalGitError(error);
					if (error instanceof Error && error.name === "BaseRefMissingError") {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: error.message,
							cause: { kind: "BASE_REF_MISSING" },
						});
					}
					throw error;
				});
		}),

	getBranchSyncStatus: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object(checkoutInput))
		.query(async ({ ctx, input }) => {
			const checkout = openCheckout(ctx, input);
			const worktreePath = checkout.path;
			const git = await checkoutGit(ctx, worktreePath);

			const currentBranch = (
				await git.revparse(["--abbrev-ref", "HEAD"]).catch(() => "")
			).trim();
			const isDetached = !currentBranch || currentBranch === "HEAD";

			const defaultBranch = await getDefaultBranchName(git);
			const isDefaultBranch =
				!isDetached && !!defaultBranch && currentBranch === defaultBranch;

			const remotes = await git.getRemotes(false).catch(() => []);
			const hasRepo = remotes.length > 0;

			let hasUpstream = false;
			let pushCount = 0;
			let pullCount = 0;
			try {
				await git.raw(["rev-parse", "--abbrev-ref", "@{upstream}"]);
				hasUpstream = true;
				const tracking = await git.raw([
					"rev-list",
					"--left-right",
					"--count",
					"@{upstream}...HEAD",
				]);
				const [pullStr, pushStr] = tracking.trim().split(/\s+/);
				pullCount = Number.parseInt(pullStr || "0", 10);
				pushCount = Number.parseInt(pushStr || "0", 10);
			} catch {
				// no upstream — counts stay zero
			}

			// Read working-tree status separately from branch info so a transient
			// `git status` failure (e.g. lock contention during a concurrent
			// operation) doesn't poison the whole sync read. Log on failure so it
			// isn't silent — `hasUncommitted` defaults to false in that case
			// because over-reporting "uncommitted" on every blip is more annoying
			// than under-reporting briefly until the next refetch.
			let hasUncommitted = false;
			try {
				const status = await git.status();
				hasUncommitted = status.files.length > 0;
			} catch (error) {
				console.warn(
					"[git/getBranchSyncStatus] git.status() failed; treating working tree as clean for this read",
					error,
				);
			}

			return {
				hasRepo,
				hasUpstream,
				pushCount,
				pullCount,
				isDefaultBranch,
				isDetached,
				hasUncommitted,
				currentBranch: isDetached ? null : currentBranch,
				defaultBranch,
			};
		}),

	getPullRequest: queryProcedure
		.input(z.object(checkoutInput))
		.query(({ ctx, input }) => {
			const { pr } = getCheckoutPullRequest(ctx.db, input);
			if (!pr) return null;

			let checks: CheckRun[] = [];
			try {
				const parsed = JSON.parse(pr.checksJson);
				if (Array.isArray(parsed)) {
					checks = parsed.map(
						(c: Record<string, unknown>): CheckRun => ({
							name: (c.name as string) ?? "",
							status: ((c.status as string) ?? "completed") as CheckStatusState,
							conclusion: (c.conclusion ?? null) as CheckConclusionState | null,
							detailsUrl: (c.url as string) ?? null,
							startedAt: (c.startedAt as string) ?? null,
							completedAt: (c.completedAt as string) ?? null,
						}),
					);
				}
			} catch {}

			return {
				number: pr.prNumber,
				url: pr.url,
				title: pr.title,
				body: null as string | null,
				state: pr.state as PullRequestState,
				isDraft: pr.isDraft ?? false,
				reviewDecision: (pr.reviewDecision ??
					null) as PullRequestReviewDecision | null,
				mergeable: "unknown" as MergeableState,
				headRefName: pr.headBranch ?? "",
				updatedAt: pr.updatedAt ? new Date(pr.updatedAt).toISOString() : "",
				checks,
				repoOwner: pr.repoOwner,
				repoName: pr.repoName,
			};
		}),

	getCheckJobLogs: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object({ ...checkoutInput, detailsUrl: z.string() }))
		.query(async ({ ctx, input }) => {
			const { pr } = getCheckoutPullRequest(ctx.db, input);
			if (!pr) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace has no associated pull request",
				});
			}

			// GitHub Actions check details URLs look like
			// https://github.com/<owner>/<repo>/actions/runs/<run_id>/job/<job_id>
			const isGithubUrl =
				URL.canParse(input.detailsUrl) &&
				new URL(input.detailsUrl).hostname === "github.com";
			const jobId = isGithubUrl
				? input.detailsUrl.match(/\/job\/(\d+)/)?.[1]
				: undefined;
			if (!jobId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Check is not a GitHub Actions job with downloadable logs",
				});
			}

			const octokit = await ctx.github();
			const { data } = await octokit.rest.actions.downloadJobLogsForWorkflowRun(
				{
					owner: pr.repoOwner,
					repo: pr.repoName,
					job_id: Number(jobId),
				},
			);
			return { logs: typeof data === "string" ? data : String(data) };
		}),

	/** @deprecated Use the API's `integration.github.getPullRequestThreads`, which acts as the viewer. Kept for released clients. */
	getPullRequestThreads: queryProcedure
		.meta({ timeoutMs: 30_000 })
		.input(z.object(checkoutInput))
		.query(async ({ ctx, input }) => {
			const { checkout, pr } = getCheckoutPullRequest(ctx.db, input);
			// Session workspaces (null projectId) have no GitHub remote.
			if (!pr || !checkout.workspace.projectId || !checkout.repository) {
				return { reviewThreads: [], conversationComments: [] };
			}
			let repo: { owner: string; name: string };
			try {
				repo = await resolveGithubRepo(
					ctx,
					checkout.workspace.projectId,
					checkout.repository.id,
				);
			} catch (err) {
				// Expected resolver failures (project not set up locally, no
				// GitHub remote) degrade silently — the review tab just stays
				// empty. Anything else is a real bug; propagate it.
				if (err instanceof TRPCError) {
					return { reviewThreads: [], conversationComments: [] };
				}
				throw err;
			}

			const octokit = await ctx.github();

			let reviewThreads: PullRequestReviewThread[] = [];
			try {
				const result: GraphQLThreadsResult = await octokit.graphql(
					REVIEW_THREADS_QUERY,
					{
						owner: repo.owner,
						name: repo.name,
						prNumber: pr.prNumber,
					},
				);
				reviewThreads = parseGraphQLThreads(result);
			} catch (error) {
				console.warn(
					"[git.getPullRequestThreads] Failed to fetch review threads:",
					error,
				);
			}

			const conversationComments: IssueComment[] = [];
			try {
				let page = 1;
				let hasMore = true;
				while (hasMore) {
					const { data: comments } = await octokit.issues.listComments({
						owner: repo.owner,
						repo: repo.name,
						issue_number: pr.prNumber,
						per_page: 100,
						page,
					});
					for (const c of comments) {
						const body = c.body?.trim();
						if (!body) continue;
						conversationComments.push({
							id: c.id,
							user: {
								login: c.user?.login ?? "ghost",
								avatarUrl: c.user?.avatar_url ?? "",
							},
							body,
							createdAt: c.created_at ?? "",
							htmlUrl: c.html_url ?? "",
						});
					}
					hasMore = comments.length === 100;
					page++;
				}
			} catch (error) {
				console.warn(
					"[git.getPullRequestThreads] Failed to fetch conversation comments:",
					error,
				);
			}

			return { reviewThreads, conversationComments };
		}),

	/** @deprecated Use the API's `integration.github.setPullRequestThreadResolution`, which acts as the viewer. Kept for released clients. */
	setReviewThreadResolution: protectedProcedure
		.input(
			z.object({
				...checkoutInput,
				threadId: z.string(),
				resolved: z.boolean(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const workspace = ctx.db.query.workspaces
				.findFirst({ where: eq(workspaces.id, input.workspaceId) })
				.sync();
			if (!workspace) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace not found",
				});
			}

			const octokit = await ctx.github();
			const mutation = input.resolved
				? `mutation($threadId: ID!) {
					resolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`
				: `mutation($threadId: ID!) {
					unresolveReviewThread(input: {threadId: $threadId}) {
						thread { id isResolved }
					}
				}`;

			try {
				await octokit.graphql(mutation, { threadId: input.threadId });
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "GraphQL mutation failed";
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
			}

			return { threadId: input.threadId, isResolved: input.resolved };
		}),

	/**
	 * Replies into a review thread on the workspace's linked PR. Threads onto
	 * `commentId` — a REST databaseId from getPullRequestThreads — which
	 * GitHub accepts for any comment already in the thread.
	 *
	 * @deprecated Use the API's `integration.github.replyToPullRequestThread`, which acts as the viewer. Kept for released clients.
	 */
	replyToReviewThread: protectedProcedure
		.input(
			z.object({
				...checkoutInput,
				commentId: z.number().int().positive(),
				body: z.string().trim().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const { pr } = getCheckoutPullRequest(ctx.db, input);
			if (!pr) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Workspace has no associated pull request",
				});
			}

			// The PR row already names the repo the PR lives in, so there's no
			// remote to parse (resolveGithubRepo). A comment id from some other
			// PR 404s rather than landing somewhere unexpected.
			const octokit = await ctx.github();
			return replyToReviewComment(octokit, {
				owner: pr.repoOwner,
				repo: pr.repoName,
				prNumber: pr.prNumber,
				commentId: input.commentId,
				body: input.body,
			});
		}),
});
