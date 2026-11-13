import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import type { Octokit } from "@octokit/rest";
import { parseGitHubRemote } from "@superset/shared/github-remote";
import { computeChecksStatus } from "@superset/shared/pull-request-checks";
import { and, eq, inArray, isNotNull, isNull, notInArray } from "drizzle-orm";
import type { HostDb } from "../../db";
import {
	pullRequests,
	repositories,
	workspacePullRequests,
	workspaceRepositories,
	workspaces,
} from "../../db/schema";
import type { EventBus } from "../../events/event-bus";
import type { GitWatcher } from "../../events/git-watcher";
import { syncWorkspaceContextFiles } from "../../trpc/router/workspace-creation/shared/workspace-context-files";
import type { ExecGh } from "../../trpc/router/workspace-creation/utils/exec-gh";
import {
	type Checkout,
	listWorkspaceCheckouts,
} from "../../workspaces/checkouts";
import {
	type GitFactory,
	gitCeilingEnv,
	resolveDefaultBranchName,
} from "../git";
import { ConditionalGh } from "./utils/conditional-gh";
import {
	GitHubAvailabilityGate,
	type GitHubAvailabilityStatus,
	GitHubUnavailableError,
	isGitHubUnreachableError,
} from "./utils/github-availability";
import {
	fetchOpenPullRequests,
	fetchOpenPullRequestsFromGh,
	fetchPullRequestByHead,
	fetchPullRequestByHeadFromGh,
	fetchPullRequestChecks,
	fetchPullRequestChecksFromGh,
	fetchPullRequestMergeQueueState,
	fetchPullRequestMergeQueueStateFromGh,
	fetchPullRequestReviewDecision,
	fetchPullRequestReviewDecisionFromGh,
	parseMergedAt,
} from "./utils/github-query";
import type {
	GitHubCheckContextNode,
	GitHubPullRequestHeadRef,
	GitHubPullRequestNode,
	GitHubPullRequestReviewDecision,
} from "./utils/github-query/types";
import {
	type ChecksStatus,
	coerceChecksStatus,
	coercePullRequestState,
	coerceReviewDecision,
	mapPullRequestState,
	mapReviewDecision,
	type PullRequestCheck,
	type PullRequestState,
	parseCheckContexts,
	parseChecksJson,
	type ReviewDecision,
} from "./utils/pull-request-mappers";
import {
	readWorkspaceRefs,
	type WorkspaceRefsSnapshot,
} from "./utils/workspace-refs";

// Long-cadence sweep that catches anything `GitWatcher` might miss
// (overflow, fs.watch errors, transient watcher failures). Steady-state
// branch syncs are event-driven via `GitWatcher.onChanged`; this is a
// belt-and-braces backup, not the primary path.
const SAFETY_NET_INTERVAL_MS = 5 * 60_000;
// Long-cadence safety net for repository-level PR refresh. Steady-state
// refreshes are triggered by `syncOneCheckout` whenever a checkout's
// branch/HEAD/upstream changes. The 60s repo-PR cache deduplicates across
// concurrent triggers.
const REPOSITORY_REFRESH_INTERVAL_MS = 5 * 60_000;
// Sweeps outlive this cache on purpose: they revalidate through ConditionalGh,
// and a 304 costs no rate limit. Raising it past the sweep only makes PRs staler.
const REPO_PULL_REQUEST_CACHE_TTL_MS = 60_000;
// A fetch that keeps failing (payload over maxBuffer, revoked auth, …) must
// not respawn `gh` at full cadence forever: each consecutive failure doubles
// the effective TTL of the cached rejection, capped here.
const REPO_PULL_REQUEST_CACHE_MAX_TTL_MS = 30 * 60_000;
// Re-probe cadence for worktrees observed missing on disk. existsSync-only —
// cheap enough to run every tick; spawning git against a missing dir is not.
const MISSING_WORKTREE_PROBE_INTERVAL_MS = 30_000;
// Dedup + link-assignment key. Branch stays case-sensitive: `feature` and
// `Feature` are distinct branches with distinct PRs, so collapsing them here
// would mislink. Case drift is tolerated only in the fallback in
// `fetchRepoPullRequests`, never in this key.
function upstreamKey(
	owner: string | null,
	repo: string | null,
	branch: string,
): string | null {
	if (!owner || !repo) return null;
	return `${owner.toLowerCase()}/${repo.toLowerCase()}#${branch}`;
}

type RepoProvider = "github";

type CheckoutRow = typeof workspaceRepositories.$inferSelect;

function checkoutKey(workspaceId: string, repositoryId: string): string {
	return `${workspaceId}\0${repositoryId}`;
}

function checkoutWhere(workspaceId: string, repositoryId: string) {
	return and(
		eq(workspaceRepositories.workspaceId, workspaceId),
		eq(workspaceRepositories.repositoryId, repositoryId),
	);
}

export interface PullRequestStateSnapshot {
	url: string;
	number: number;
	title: string;
	state: PullRequestState;
	reviewDecision: ReviewDecision;
	checksStatus: ChecksStatus;
	checks: PullRequestCheck[];
	/** GitHub merge time when available, observation time only as fallback; epoch ms. Never cleared once set. */
	mergedAt: number | null;
}

export interface CheckoutPullRequestSnapshot {
	repositoryId: string;
	pullRequest: PullRequestStateSnapshot | null;
	error: string | null;
	lastFetchedAt: string | null;
}

export interface PullRequestWorkspaceSnapshot {
	workspaceId: string;
	/** One per checkout, sorted by repository name; empty for a session workspace. */
	checkouts: CheckoutPullRequestSnapshot[];
}

export interface WorkspacePullRequestHistoryEntry {
	repoOwner: string;
	repoName: string;
	number: number;
	url: string;
	title: string;
	state: PullRequestState;
	isDraft: boolean;
	headBranch: string;
	reviewDecision: ReviewDecision;
	checksStatus: ChecksStatus;
	/** GitHub merge time when available, observation time only as fallback; epoch ms. Never cleared once set. */
	mergedAt: number | null;
	/** Row refresh time, epoch ms — ordering, not GitHub's own clock. */
	updatedAt: number;
	/** When this workspace first linked to the PR, epoch ms. */
	linkedAt: number;
	/** True for the PR the sidebar shows: the one on the checkout's current branch. */
	isCurrent: boolean;
}

export interface WorkspacePullRequestHistory {
	workspaceId: string;
	/**
	 * Current checkouts sorted by repository name, then any repository the
	 * workspace linked a PR in but no longer checks out.
	 */
	checkouts: {
		repositoryId: string;
		pullRequests: WorkspacePullRequestHistoryEntry[];
	}[];
}

export interface PullRequestRuntimeManagerOptions {
	db: HostDb;
	execGh: ExecGh;
	git: GitFactory;
	github: () => Promise<Octokit>;
	gitWatcher: GitWatcher;
	/** Override to run the per-checkout branch/HEAD/upstream read off the
	 * event loop (app wiring passes a worker-pool-backed reader). Defaults
	 * to reading in-process via `git`. */
	readWorkspaceRefs?: (worktreePath: string) => Promise<WorkspaceRefsSnapshot>;
	/** Test seam for the missing-worktree gate. Defaults to `existsSync`. */
	worktreeExists?: (worktreePath: string) => boolean;
}

interface NormalizedRepoIdentity {
	provider: RepoProvider;
	owner: string;
	name: string;
	url: string;
	remoteName: string;
	// Null when the repo can't be opened. Drives the default-branch link guard.
	defaultBranch: string | null;
}

type PullRequestRow = typeof pullRequests.$inferSelect;

export interface CheckoutPullRequestMetadata {
	number: number;
	url: string;
	title: string;
	state: "open" | "closed" | "merged";
	isDraft?: boolean;
	/** GitHub's `merged_at` (ISO 8601) when the caller has it. */
	mergedAt?: string | null;
	headRefName: string;
	headRefOid: string;
	headRepositoryOwner?: string | null;
	headRepositoryName?: string | null;
	isCrossRepository: boolean;
}

function mapCheckoutPullRequestState(
	state: CheckoutPullRequestMetadata["state"],
	isDraft: boolean,
): PullRequestState {
	if (state === "merged") return "merged";
	if (state === "closed") return "closed";
	if (isDraft) return "draft";
	return "open";
}

function deriveCheckoutPullRequestUpstream(
	repo: NormalizedRepoIdentity,
	pr: CheckoutPullRequestMetadata,
): { owner: string; name: string; branch: string } | null {
	if (!pr.isCrossRepository) {
		return { owner: repo.owner, name: repo.name, branch: pr.headRefName };
	}

	const owner = pr.headRepositoryOwner?.trim();
	const name = pr.headRepositoryName?.trim();
	if (!owner || !name) return null;
	return { owner, name, branch: pr.headRefName };
}

interface RepositoryRefreshOptions {
	bypassCache?: boolean;
	/** Limit fetching and relinking to these checkouts; absent = every checkout. */
	checkoutKeys?: string[];
}

interface PullRequestDetails {
	reviewDecision: GitHubPullRequestReviewDecision;
	checks: GitHubCheckContextNode[];
	/** Null when the PR cannot be queued (closed, draft) or the lookup failed. */
	isInMergeQueue: boolean | null;
}

export class PullRequestRuntimeManager {
	private readonly db: HostDb;
	private readonly execGh: ExecGh;
	private readonly conditionalGh: ConditionalGh;
	private readonly git: GitFactory;
	private readonly github: () => Promise<Octokit>;
	private readonly gitWatcher: GitWatcher;
	private safetyNetTimer: ReturnType<typeof setInterval> | null = null;
	private repositoryRefreshTimer: ReturnType<typeof setInterval> | null = null;
	private unsubscribeFromGitWatcher: (() => void) | null = null;
	private unsubscribeFromWorkspaceEvents: (() => void) | null = null;
	private readonly inFlightRepositories = new Map<string, Promise<void>>();
	// One gate for every GitHub call the runtime makes: an unreachable GitHub
	// is a property of this host's network, not of any repo.
	private readonly githubGate = new GitHubAvailabilityGate();
	// Fires one fleet refresh the moment a hold ends, so "new pull requests
	// appear once the limit resets" is true within seconds rather than at
	// the next 5-minute sweep.
	private holdRecoveryTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly checkoutSyncState = new Map<
		string,
		{ running: Promise<void>; rerunPending: boolean; bypassCache: boolean }
	>();
	private readonly pullRequestHeadCache = new Map<
		string,
		{
			promise: Promise<GitHubPullRequestNode | null>;
			fetchedAt: number;
			consecutiveFailures: number;
		}
	>();
	// Review decision, checks, and merge-queue state per PR head. These were
	// the bulk of the runtime's GitHub traffic: four uncached calls per linked
	// PR on every project refresh, which on a fleet of a few dozen workspaces
	// spends the user's hourly quota by itself (SUPER-2107).
	private pullRequestDetailsCache = new Map<
		string,
		{
			promise: Promise<PullRequestDetails>;
			fetchedAt: number;
			consecutiveFailures: number;
			fingerprint?: string;
		}
	>();
	private readonly openPullRequestsCache = new Map<
		string,
		{
			promise: Promise<GitHubPullRequestNode[]>;
			fetchedAt: number;
			consecutiveFailures: number;
		}
	>();
	private readonly readWorkspaceRefs: (
		worktreePath: string,
	) => Promise<WorkspaceRefsSnapshot>;
	private readonly worktreeExists: (worktreePath: string) => boolean;
	// Worktrees deleted out from under us (external `rm`, crashed teardown).
	// While a checkout is listed here, sync attempts cost one existsSync and
	// spawn no git; the probe timer re-enters the normal sync path when the
	// directory reappears. One log line per transition, never per attempt.
	private readonly missingWorktrees = new Map<
		string,
		{ workspaceId: string; repositoryId: string; path: string }
	>();
	private missingWorktreeProbeTimer: ReturnType<typeof setInterval> | null =
		null;
	private readonly linkListeners = new Set<() => void>();
	private stopped = false;

	constructor(options: PullRequestRuntimeManagerOptions) {
		this.db = options.db;
		this.conditionalGh = new ConditionalGh(options.execGh);
		this.execGh = this.conditionalGh.exec;
		this.git = options.git;
		this.github = options.github;
		this.gitWatcher = options.gitWatcher;
		this.readWorkspaceRefs =
			options.readWorkspaceRefs ??
			(async (worktreePath) =>
				readWorkspaceRefs(
					await this.git(worktreePath, { env: gitCeilingEnv(worktreePath) }),
				));
		this.worktreeExists = options.worktreeExists ?? existsSync;
	}

	start() {
		if (
			this.safetyNetTimer ||
			this.repositoryRefreshTimer ||
			this.unsubscribeFromGitWatcher
		)
			return;
		this.stopped = false;

		// One initial sweep so checkouts that existed before this manager
		// started have correct branch/sha/upstream rows even if no `.git/`
		// activity has happened since the last process boot.
		void this.syncWorkspaceBranches();
		void this.refreshEligibleRepositories();

		// Steady-state: react to real `.git/` activity per checkout. Debounce
		// lives in `GitWatcher` (300 ms), and concurrent repository refreshes
		// are deduplicated by `inFlightRepositories`. We additionally serialize
		// per checkout so two debounce-separated bursts can't race their git
		// reads and have the slower one overwrite the newer snapshot.
		//
		// Deliberately never calls `gitWatcher.watchWorkspace()` here: watching
		// every workspace would put each one under a live fs.watch permanently,
		// reintroducing the watcher/subprocess fan-out #6848 fixed. For a
		// workspace no renderer watches, sync degrades to the
		// `SAFETY_NET_INTERVAL_MS` sweep below — an accepted staleness tradeoff.
		this.unsubscribeFromGitWatcher = this.gitWatcher.onChanged((event) => {
			if (event.repositoryId) {
				void this.enqueueCheckoutSync(event.workspaceId, event.repositoryId);
			}
		});

		this.safetyNetTimer = setInterval(() => {
			void this.syncWorkspaceBranches();
		}, SAFETY_NET_INTERVAL_MS);
		this.repositoryRefreshTimer = setInterval(() => {
			void this.refreshEligibleRepositories();
		}, REPOSITORY_REFRESH_INTERVAL_MS);
	}

	// A brand-new worktree is git-idle, so `GitWatcher` never fires for it and
	// its checkout rows (NULL upstream/head) are invisible to PR matching until
	// the 5-min safety net. Reacting to `created` closes that gap via the same
	// coalesced sync path. Wired post-construction because app.ts builds the
	// EventBus after this manager. Only `created`: branch edits already arrive
	// through GitWatcher, and this manager's own row writes bypass the store
	// emitters, so syncing can't re-trigger itself.
	subscribeToWorkspaceEvents(
		eventBus: Pick<EventBus, "onWorkspaceChanged">,
	): void {
		if (this.unsubscribeFromWorkspaceEvents) return;
		this.unsubscribeFromWorkspaceEvents = eventBus.onWorkspaceChanged(
			(event) => {
				if (event.eventType !== "created") return;
				void this.enqueueWorkspaceSync(event.workspaceId);
			},
		);
	}

	stop() {
		this.stopped = true;
		this.conditionalGh.clear();
		if (this.safetyNetTimer) clearInterval(this.safetyNetTimer);
		if (this.repositoryRefreshTimer) clearInterval(this.repositoryRefreshTimer);
		if (this.missingWorktreeProbeTimer)
			clearInterval(this.missingWorktreeProbeTimer);
		if (this.holdRecoveryTimer) clearTimeout(this.holdRecoveryTimer);
		this.holdRecoveryTimer = null;
		this.unsubscribeFromGitWatcher?.();
		this.unsubscribeFromWorkspaceEvents?.();
		this.safetyNetTimer = null;
		this.repositoryRefreshTimer = null;
		this.missingWorktreeProbeTimer = null;
		this.missingWorktrees.clear();
		this.unsubscribeFromGitWatcher = null;
		this.unsubscribeFromWorkspaceEvents = null;
	}

	/** Settles once the syncs and refreshes running at `stop()` are done. */
	async drain(): Promise<void> {
		while (
			this.checkoutSyncState.size > 0 ||
			this.inFlightRepositories.size > 0
		) {
			await Promise.allSettled([
				...[...this.checkoutSyncState.values()].map((state) => state.running),
				...this.inFlightRepositories.values(),
			]);
		}
	}

	/** Checkout rows of these workspaces with their repository's name, by workspace. */
	private checkoutRowsByWorkspace(
		workspaceIds: string[],
	): Map<string, (CheckoutRow & { repositoryName: string })[]> {
		const byWorkspace = new Map<
			string,
			(CheckoutRow & { repositoryName: string })[]
		>();
		if (workspaceIds.length === 0) return byWorkspace;
		const rows = this.db
			.select({ row: workspaceRepositories, repositoryName: repositories.name })
			.from(workspaceRepositories)
			.innerJoin(
				repositories,
				eq(repositories.id, workspaceRepositories.repositoryId),
			)
			.where(inArray(workspaceRepositories.workspaceId, workspaceIds))
			.all();
		for (const { row, repositoryName } of rows) {
			const list = byWorkspace.get(row.workspaceId) ?? [];
			list.push({ ...row, repositoryName });
			byWorkspace.set(row.workspaceId, list);
		}
		for (const list of byWorkspace.values()) {
			list.sort((a, b) => a.repositoryName.localeCompare(b.repositoryName));
		}
		return byWorkspace;
	}

	private existingWorkspaceIds(workspaceIds: string[]): string[] {
		if (workspaceIds.length === 0) return [];
		const found = new Set(
			this.db
				.select({ id: workspaces.id })
				.from(workspaces)
				.where(inArray(workspaces.id, workspaceIds))
				.all()
				.map((row) => row.id),
		);
		return workspaceIds.filter((id) => found.has(id));
	}

	async getPullRequestsByWorkspaces(
		workspaceIds: string[],
	): Promise<PullRequestWorkspaceSnapshot[]> {
		const ids = this.existingWorkspaceIds(workspaceIds);
		if (ids.length === 0) return [];
		const checkouts = this.checkoutRowsByWorkspace(ids);
		const linkedIds = [...checkouts.values()]
			.flat()
			.map((row) => row.pullRequestId)
			.filter((id) => id !== null);
		const prById = new Map(
			(linkedIds.length
				? this.db
						.select()
						.from(pullRequests)
						.where(inArray(pullRequests.id, linkedIds))
						.all()
				: []
			).map((row) => [row.id, row]),
		);

		return ids.map((workspaceId) => ({
			workspaceId,
			checkouts: (checkouts.get(workspaceId) ?? []).map((checkout) => {
				const pr = checkout.pullRequestId
					? prById.get(checkout.pullRequestId)
					: undefined;
				return {
					repositoryId: checkout.repositoryId,
					pullRequest: pr
						? {
								url: pr.url,
								number: pr.prNumber,
								title: pr.title,
								state: coercePullRequestState(pr.state),
								reviewDecision: coerceReviewDecision(pr.reviewDecision),
								checksStatus: coerceChecksStatus(pr.checksStatus),
								checks: parseChecksJson(pr.checksJson),
								mergedAt: pr.mergedAt ?? null,
							}
						: null,
					error: pr?.error ?? null,
					lastFetchedAt: pr?.lastFetchedAt
						? new Date(pr.lastFetchedAt).toISOString()
						: null,
				};
			}),
		}));
	}

	/**
	 * Why PR links stopped updating, if they did. The sweep keeps existing
	 * links through a hold but cannot create new ones, so the UI needs this to
	 * say so instead of showing a workspace with no PR.
	 */
	getGithubStatus(): GitHubAvailabilityStatus | null {
		return this.githubGate.status();
	}

	/**
	 * Every PR each workspace has ever been linked to, per repository, the
	 * checkout's current one first and then newest link first. Suppressed
	 * ("Remove PR Link") PRs stay listed — suppression governs the sidebar
	 * pointer, not the history.
	 */
	async getPullRequestHistoryByWorkspaces(
		workspaceIds: string[],
	): Promise<WorkspacePullRequestHistory[]> {
		if (workspaceIds.length === 0) return [];

		const checkouts = this.checkoutRowsByWorkspace(workspaceIds);
		const rows = this.db
			.select({
				workspaceId: workspacePullRequests.workspaceId,
				linkedAt: workspacePullRequests.linkedAt,
				pullRequestRowId: pullRequests.id,
				repositoryId: pullRequests.repositoryId,
				repoOwner: pullRequests.repoOwner,
				repoName: pullRequests.repoName,
				prNumber: pullRequests.prNumber,
				url: pullRequests.url,
				title: pullRequests.title,
				state: pullRequests.state,
				isDraft: pullRequests.isDraft,
				headBranch: pullRequests.headBranch,
				reviewDecision: pullRequests.reviewDecision,
				checksStatus: pullRequests.checksStatus,
				mergedAt: pullRequests.mergedAt,
				updatedAt: pullRequests.updatedAt,
			})
			.from(workspacePullRequests)
			.innerJoin(
				pullRequests,
				eq(workspacePullRequests.pullRequestId, pullRequests.id),
			)
			.where(inArray(workspacePullRequests.workspaceId, workspaceIds))
			.all();

		const current = new Map<string, string | null>();
		for (const list of checkouts.values()) {
			for (const checkout of list) {
				current.set(
					checkoutKey(checkout.workspaceId, checkout.repositoryId),
					checkout.pullRequestId,
				);
			}
		}

		const byCheckout = new Map<string, WorkspacePullRequestHistoryEntry[]>();
		for (const row of rows) {
			const key = checkoutKey(row.workspaceId, row.repositoryId);
			const entry: WorkspacePullRequestHistoryEntry = {
				repoOwner: row.repoOwner,
				repoName: row.repoName,
				number: row.prNumber,
				url: row.url,
				title: row.title,
				state: coercePullRequestState(row.state),
				isDraft: row.isDraft,
				headBranch: row.headBranch,
				reviewDecision: coerceReviewDecision(row.reviewDecision),
				checksStatus: coerceChecksStatus(row.checksStatus),
				mergedAt: row.mergedAt ?? null,
				updatedAt: row.updatedAt,
				linkedAt: row.linkedAt,
				isCurrent: row.pullRequestRowId === current.get(key),
			};
			const list = byCheckout.get(key);
			if (list) list.push(entry);
			else byCheckout.set(key, [entry]);
		}

		return workspaceIds.map((workspaceId) => {
			const repositoryIds = (checkouts.get(workspaceId) ?? []).map(
				(checkout) => checkout.repositoryId,
			);
			for (const row of rows) {
				if (
					row.workspaceId === workspaceId &&
					!repositoryIds.includes(row.repositoryId)
				) {
					repositoryIds.push(row.repositoryId);
				}
			}
			return {
				workspaceId,
				checkouts: repositoryIds.map((repositoryId) => ({
					repositoryId,
					pullRequests: (
						byCheckout.get(checkoutKey(workspaceId, repositoryId)) ?? []
					).sort((a, b) => {
						if (a.isCurrent !== b.isCurrent) return a.isCurrent ? -1 : 1;
						return b.linkedAt - a.linkedAt;
					}),
				})),
			};
		});
	}

	async refreshPullRequestsByWorkspaces(workspaceIds: string[]): Promise<void> {
		if (workspaceIds.length === 0) return;

		// Session workspaces (null projectId) have no remote to sync; archived
		// workspaces keep their PR state frozen at destroy time.
		const active = this.db
			.select()
			.from(workspaces)
			.where(inArray(workspaces.id, workspaceIds))
			.all()
			.filter((row) => row.archivedAt == null && row.projectId != null);

		// Re-read each checkout's git refs before matching: callers hit this
		// right after changing git state (first push, PR create, merge), and
		// the refresh matches PRs by the row's recorded upstream — a stale row
		// would miss the freshly created PR until the next watcher sweep.
		// Through the per-checkout queue, so an overlapping watcher sync can't
		// interleave with this read+write and clobber the newer snapshot.
		await Promise.all(
			active.map((workspace) =>
				this.enqueueWorkspaceSync(workspace.id, { bypassCache: true }),
			),
		);
	}

	async listLinkedPullRequests(): Promise<
		{ repository: string; number: number; linkedAt: number }[]
	> {
		const workspaceIds = this.db
			.select({ id: workspaces.id })
			.from(workspaces)
			.all()
			.map((row) => row.id);
		const histories =
			await this.getPullRequestHistoryByWorkspaces(workspaceIds);
		const earliest = new Map<
			string,
			{ repository: string; number: number; linkedAt: number }
		>();
		for (const pullRequest of histories.flatMap((h) =>
			h.checkouts.flatMap((checkout) => checkout.pullRequests),
		)) {
			const repository = `${pullRequest.repoOwner}/${pullRequest.repoName}`;
			const key = `${repository.toLowerCase()}#${pullRequest.number}`;
			const seen = earliest.get(key);
			if (!seen || pullRequest.linkedAt < seen.linkedAt) {
				earliest.set(key, {
					repository,
					number: pullRequest.number,
					linkedAt: pullRequest.linkedAt,
				});
			}
		}
		return [...earliest.values()];
	}

	// User-initiated "Remove PR Link" on one checkout. Recording the removed PR
	// id keeps the refresh sweep from re-linking it while its branch still
	// matches; a different PR on the branch (or an explicit re-link) still links.
	unlinkWorkspacePullRequest(workspaceId: string, repositoryId: string): void {
		const checkout = this.getCheckoutRow(workspaceId, repositoryId);
		if (!checkout?.pullRequestId) return;
		this.db
			.update(workspaceRepositories)
			.set({
				pullRequestId: null,
				suppressedPullRequestId: checkout.pullRequestId,
			})
			.where(checkoutWhere(workspaceId, repositoryId))
			.run();
	}

	async linkWorkspaceToCheckoutPullRequest({
		workspaceId,
		repositoryId,
		pullRequest,
	}: {
		workspaceId: string;
		repositoryId: string;
		pullRequest: CheckoutPullRequestMetadata;
	}): Promise<string | null> {
		const repo = await this.getRepositoryIdentity(repositoryId);
		if (!repo) {
			console.warn(
				"[host-service:pull-request-runtime] linkWorkspaceToCheckoutPullRequest: skipping; repository metadata unavailable",
				{ repositoryId, workspaceId, prNumber: pullRequest.number },
			);
			return null;
		}

		const existing = this.findPullRequestRow(repo, pullRequest.number);
		const existingChecks = parseChecksJson(existing?.checksJson ?? null);
		const now = Date.now();
		const isDraft = pullRequest.isDraft ?? false;
		const rowId = this.upsertPullRequestRow({
			existing,
			repositoryId,
			repo,
			prNumber: pullRequest.number,
			url: pullRequest.url,
			title: pullRequest.title,
			state: mapCheckoutPullRequestState(pullRequest.state, isDraft),
			isDraft,
			headBranch: pullRequest.headRefName,
			headSha: pullRequest.headRefOid,
			mergedAt: parseMergedAt(pullRequest.mergedAt ?? null),
			reviewDecision: coerceReviewDecision(existing?.reviewDecision ?? null),
			checksStatus: coerceChecksStatus(existing?.checksStatus ?? null),
			checksJson: JSON.stringify(existingChecks),
			lastFetchedAt: existing?.lastFetchedAt ?? now,
			error: null,
			now,
		});

		const upstream = deriveCheckoutPullRequestUpstream(repo, pullRequest);
		this.db
			.update(workspaceRepositories)
			.set({
				pullRequestId: rowId,
				// An explicit checkout link overrides an earlier "Remove PR Link".
				suppressedPullRequestId: null,
				headSha: pullRequest.headRefOid,
				upstreamOwner: upstream?.owner ?? null,
				upstreamRepo: upstream?.name ?? null,
				upstreamBranch: upstream?.branch ?? null,
			})
			.where(checkoutWhere(workspaceId, repositoryId))
			.run();
		this.recordWorkspacePullRequestLink(workspaceId, rowId, now);

		return rowId;
	}

	/**
	 * Memory of every PR a workspace has been linked to. The current-link
	 * pointer moves on when the branch does; this row stays, so the
	 * workspace's whole PR history remains listable. Unlinking hides a PR
	 * from the sidebar surfaces, never from here. Only
	 * `forgetPastPromotionLinks` deletes rows.
	 */
	private recordWorkspacePullRequestLink(
		workspaceId: string,
		pullRequestId: string,
		linkedAt: number,
	): void {
		const { changes } = this.db
			.insert(workspacePullRequests)
			.values({ workspaceId, pullRequestId, linkedAt })
			.onConflictDoNothing()
			.run();
		if (changes === 0) return;
		for (const listener of this.linkListeners) listener();
	}

	// Drops head=<default> PRs this workspace only picked up after they had
	// closed (past promotions such as main -> staging). A PR linked while
	// open, e.g. a git-flow release PR, keeps its history row.
	private forgetPastPromotionLinks(
		workspaceId: string,
		repositoryId: string,
		repo: NormalizedRepoIdentity,
	): void {
		if (!repo.defaultBranch) return;
		const staleIds = this.db
			.select({
				pullRequestId: workspacePullRequests.pullRequestId,
				linkedAt: workspacePullRequests.linkedAt,
				mergedAt: pullRequests.mergedAt,
			})
			.from(workspacePullRequests)
			.innerJoin(
				pullRequests,
				eq(workspacePullRequests.pullRequestId, pullRequests.id),
			)
			.innerJoin(
				workspaces,
				eq(workspacePullRequests.workspaceId, workspaces.id),
			)
			.where(
				and(
					eq(workspacePullRequests.workspaceId, workspaceId),
					isNull(workspaces.archivedAt),
					eq(pullRequests.repositoryId, repositoryId),
					eq(pullRequests.repoOwner, repo.owner),
					eq(pullRequests.repoName, repo.name),
					eq(pullRequests.headBranch, repo.defaultBranch),
					notInArray(pullRequests.state, ["open", "draft"]),
				),
			)
			.all()
			.filter((row) => row.mergedAt == null || row.mergedAt <= row.linkedAt)
			.map((row) => row.pullRequestId);
		if (staleIds.length === 0) return;
		this.db
			.delete(workspacePullRequests)
			.where(
				and(
					eq(workspacePullRequests.workspaceId, workspaceId),
					inArray(workspacePullRequests.pullRequestId, staleIds),
				),
			)
			.run();
		for (const listener of this.linkListeners) listener();
	}

	onPullRequestLinked(listener: () => void): () => void {
		this.linkListeners.add(listener);
		return () => this.linkListeners.delete(listener);
	}

	/** Checkouts of live project workspaces; session and archived ones never sync. */
	private listSyncableCheckouts(): {
		workspaceId: string;
		repositoryId: string;
	}[] {
		return this.db
			.select({
				workspaceId: workspaceRepositories.workspaceId,
				repositoryId: workspaceRepositories.repositoryId,
			})
			.from(workspaceRepositories)
			.innerJoin(
				workspaces,
				eq(workspaces.id, workspaceRepositories.workspaceId),
			)
			.where(
				and(isNull(workspaces.archivedAt), isNotNull(workspaces.projectId)),
			)
			.all();
	}

	private async syncWorkspaceBranches(): Promise<void> {
		// Route every checkout through the same per-checkout queue as the
		// watcher path, so a concurrent watcher-triggered sync can't race the
		// sweep's read+write. Sequential to keep git subprocess concurrency
		// bounded; refreshRepository dedupes via inFlightRepositories.
		for (const checkout of this.listSyncableCheckouts()) {
			await this.enqueueCheckoutSync(
				checkout.workspaceId,
				checkout.repositoryId,
			);
		}
	}

	private async enqueueWorkspaceSync(
		workspaceId: string,
		options: { bypassCache?: boolean } = {},
	): Promise<void> {
		const rows = this.db
			.select({ repositoryId: workspaceRepositories.repositoryId })
			.from(workspaceRepositories)
			.where(eq(workspaceRepositories.workspaceId, workspaceId))
			.all();
		await Promise.all(
			rows.map((row) =>
				this.enqueueCheckoutSync(workspaceId, row.repositoryId, options),
			),
		);
	}

	private enqueueCheckoutSync(
		workspaceId: string,
		repositoryId: string,
		options: { bypassCache?: boolean } = {},
	): Promise<void> {
		// Coalesce: if a sync is already running for this checkout, just mark
		// "rerun pending" — only the final state matters. At most one sync runs
		// and one rerun is queued, regardless of how many events fire. A bypass
		// request sticks to the rerun so the user's refresh is never served
		// from cache by a sync that happened to be in flight.
		if (this.stopped) return Promise.resolve();
		const key = checkoutKey(workspaceId, repositoryId);
		const existing = this.checkoutSyncState.get(key);
		if (existing) {
			existing.rerunPending = true;
			existing.bypassCache ||= options.bypassCache ?? false;
			return existing.running;
		}

		const run = async (): Promise<void> => {
			let bypassCache = options.bypassCache ?? false;
			try {
				do {
					const state = this.checkoutSyncState.get(key);
					if (state) {
						state.rerunPending = false;
						state.bypassCache = false;
					}
					await this.syncOneCheckout(workspaceId, repositoryId, {
						bypassCache,
					});
					bypassCache = this.checkoutSyncState.get(key)?.bypassCache ?? false;
				} while (
					!this.stopped &&
					this.checkoutSyncState.get(key)?.rerunPending
				);
			} finally {
				this.checkoutSyncState.delete(key);
			}
		};

		const running = run();
		this.checkoutSyncState.set(key, {
			running,
			rerunPending: false,
			bypassCache: false,
		});
		return running;
	}

	private getCheckoutRow(
		workspaceId: string,
		repositoryId: string,
	): CheckoutRow | undefined {
		return this.db
			.select()
			.from(workspaceRepositories)
			.where(checkoutWhere(workspaceId, repositoryId))
			.get();
	}

	private isLiveWorkspace(workspaceId: string): boolean {
		return (
			this.db
				.select({ id: workspaces.id })
				.from(workspaces)
				.where(
					and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt)),
				)
				.get() !== undefined
		);
	}

	private async syncOneCheckout(
		workspaceId: string,
		repositoryId: string,
		options: { bypassCache?: boolean } = {},
	): Promise<void> {
		const key = checkoutKey(workspaceId, repositoryId);
		// Look up the rows fresh — the workspace may have been deleted between
		// the GitWatcher event firing and this handler running. That's expected
		// during teardown / workspace removal; silently no-op.
		const workspace = this.db
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		// Session workspaces (null projectId) have no remote and no PRs.
		// Archived workspaces are frozen tombstones — never resync or relink.
		if (
			!workspace ||
			workspace.projectId === null ||
			workspace.archivedAt !== null
		) {
			this.forgetMissingWorktree(key);
			return;
		}
		const checkouts = listWorkspaceCheckouts(this.db, workspace);
		const checkout = checkouts.find((c) => c.repository.id === repositoryId);
		if (!checkout) {
			this.forgetMissingWorktree(key);
			return;
		}

		// A watcher event refreshes only when the row actually changed; an
		// explicit refresh always does, even if the git read failed.
		const changed = await this.syncCheckoutRow(
			workspace,
			checkout,
			checkouts.filter((other) => other !== checkout),
		);
		// One checkout moved, so only its own ref can have gained or lost a PR.
		// Refreshing the whole repository here was the runtime's biggest GitHub
		// amplifier: every commit by any agent re-fetched every linked PR.
		if (this.stopped) return;
		if (changed || options.bypassCache) {
			await this.refreshRepository(repositoryId, {
				...options,
				checkoutKeys: [key],
			});
		}
	}

	private async syncCheckoutRow(
		workspace: typeof workspaces.$inferSelect,
		checkout: Checkout,
		otherCheckouts: Checkout[],
	): Promise<boolean> {
		const { row, path } = checkout;
		const key = checkoutKey(row.workspaceId, row.repositoryId);
		// A worktree deleted outside the app is a routine lifecycle state, not
		// an error to retry: skip the git spawn entirely until the directory is
		// back on disk (external restore, workspace repair).
		if (!this.worktreeExists(path)) {
			this.noteWorktreeMissing(key, row, path);
			return false;
		}
		this.noteWorktreePresent(key);
		try {
			const { branch, headSha, upstream } = await this.readWorkspaceRefs(path);
			if (!branch) return false;

			const upstreamOwner = upstream?.owner ?? null;
			const upstreamRepo = upstream?.name ?? null;
			const upstreamBranch = upstream?.branch ?? null;
			const pullRequestId =
				upstream || this.pullRequestHeadMatches(row.pullRequestId, headSha)
					? row.pullRequestId
					: null;
			const mirrorBranch =
				branch !== workspace.branch &&
				otherCheckouts.every((other) => other.row.branch === branch);

			if (
				!mirrorBranch &&
				branch === row.branch &&
				headSha === row.headSha &&
				upstreamOwner === row.upstreamOwner &&
				upstreamRepo === row.upstreamRepo &&
				upstreamBranch === row.upstreamBranch &&
				pullRequestId === row.pullRequestId
			) {
				return false;
			}

			// Guard: the workspace can archive during the awaited ref read; a
			// tombstone's branch/PR link is frozen. Sync reads and writes, so
			// nothing can interleave between this check and the writes.
			if (!this.isLiveWorkspace(workspace.id)) return false;
			this.db
				.update(workspaceRepositories)
				.set({
					branch,
					headSha,
					upstreamOwner,
					upstreamRepo,
					upstreamBranch,
					pullRequestId,
				})
				.where(checkoutWhere(row.workspaceId, row.repositoryId))
				.run();
			if (mirrorBranch) {
				this.db
					.update(workspaces)
					.set({ branch, updatedAt: Date.now() })
					.where(eq(workspaces.id, workspace.id))
					.run();
			}
			if (branch !== row.branch || headSha !== row.headSha) {
				syncWorkspaceContextFiles(this.db, workspace.id);
			}
			return true;
		} catch (error) {
			if (this.stopped) return false;
			console.warn(
				"[host-service:pull-request-runtime] Failed to sync checkout branch",
				{
					workspaceId: row.workspaceId,
					repositoryId: row.repositoryId,
					path,
					error,
				},
			);
			return false;
		}
	}

	private noteWorktreeMissing(
		key: string,
		row: { workspaceId: string; repositoryId: string },
		path: string,
	): void {
		if (this.missingWorktrees.has(key)) return;
		this.missingWorktrees.set(key, {
			workspaceId: row.workspaceId,
			repositoryId: row.repositoryId,
			path,
		});
		console.warn(
			"[host-service:pull-request-runtime] Worktree missing on disk; pausing branch sync until it reappears",
			{ workspaceId: row.workspaceId, repositoryId: row.repositoryId, path },
		);
		this.missingWorktreeProbeTimer ??= setInterval(() => {
			for (const missing of this.missingWorktrees.values()) {
				if (this.worktreeExists(missing.path)) {
					void this.enqueueCheckoutSync(
						missing.workspaceId,
						missing.repositoryId,
					);
				}
			}
		}, MISSING_WORKTREE_PROBE_INTERVAL_MS);
	}

	private noteWorktreePresent(key: string): void {
		const missing = this.missingWorktrees.get(key);
		if (missing === undefined) return;
		this.forgetMissingWorktree(key);
		console.warn(
			"[host-service:pull-request-runtime] Worktree reappeared; resuming branch sync",
			missing,
		);
	}

	private forgetMissingWorktree(key: string): void {
		if (!this.missingWorktrees.delete(key)) return;
		if (this.missingWorktrees.size === 0 && this.missingWorktreeProbeTimer) {
			clearInterval(this.missingWorktreeProbeTimer);
			this.missingWorktreeProbeTimer = null;
		}
	}

	private async refreshEligibleRepositories(): Promise<void> {
		const repositoryIds = [
			...new Set(
				this.listSyncableCheckouts().map((checkout) => checkout.repositoryId),
			),
		];
		await Promise.all(
			repositoryIds.map((repositoryId) => this.refreshRepository(repositoryId)),
		);
	}

	private async refreshRepository(
		repositoryId: string,
		options: RepositoryRefreshOptions = {},
	): Promise<void> {
		// A scoped refresh and a full one are different work; only identical
		// requests share an in-flight promise.
		if (this.stopped) return;
		const inFlightKey = options.checkoutKeys
			? `${repositoryId}\0${[...options.checkoutKeys].sort().join(",")}`
			: repositoryId;
		const existing = this.inFlightRepositories.get(inFlightKey);
		if (existing) {
			await existing;
			return;
		}

		const refreshPromise = this.performRepositoryRefresh(repositoryId, options)
			.catch((error) => {
				if (this.stopped) return;
				console.warn(
					"[host-service:pull-request-runtime] Repository refresh failed",
					{ repositoryId, error },
				);
			})
			.finally(() => {
				this.inFlightRepositories.delete(inFlightKey);
			});

		this.inFlightRepositories.set(inFlightKey, refreshPromise);
		await refreshPromise;
	}

	/** Point a checkout at a PR, unless its workspace archived meanwhile. */
	private setCheckoutPullRequest(
		checkout: CheckoutRow,
		pullRequestId: string | null,
	): void {
		if (!this.isLiveWorkspace(checkout.workspaceId)) return;
		this.db
			.update(workspaceRepositories)
			.set({ pullRequestId })
			.where(checkoutWhere(checkout.workspaceId, checkout.repositoryId))
			.run();
	}

	private async performRepositoryRefresh(
		repositoryId: string,
		options: RepositoryRefreshOptions = {},
	): Promise<void> {
		const repo = await this.getRepositoryIdentity(repositoryId);
		if (!repo) return;

		const scope = options.checkoutKeys ? new Set(options.checkoutKeys) : null;
		// Archived workspaces keep their frozen PR link; refreshing them could
		// clear it (e.g. branch deleted). Rows outside the scope are neither
		// fetched nor relinked.
		const checkouts = this.db
			.select({ row: workspaceRepositories })
			.from(workspaceRepositories)
			.innerJoin(
				workspaces,
				eq(workspaces.id, workspaceRepositories.workspaceId),
			)
			.where(
				and(
					eq(workspaceRepositories.repositoryId, repositoryId),
					isNull(workspaces.archivedAt),
				),
			)
			.all()
			.map(({ row }) => row)
			.filter(
				(row) =>
					!scope || scope.has(checkoutKey(row.workspaceId, row.repositoryId)),
			);
		if (checkouts.length === 0) return;

		const wantedRefs = new Map<string, GitHubPullRequestHeadRef>();
		for (const checkout of checkouts) {
			const key = this.effectiveUpstreamKey(checkout, repo);
			if (key && checkout.upstreamOwner && checkout.upstreamRepo) {
				wantedRefs.set(key, {
					owner: checkout.upstreamOwner,
					repo: checkout.upstreamRepo,
					branch: checkout.upstreamBranch ?? checkout.branch,
				});
			}
		}

		const { failedKeys, matched: keyToPullRequest } =
			await this.fetchRepoPullRequests(repositoryId, repo, wantedRefs, options);

		for (const checkout of checkouts) {
			const key = this.effectiveUpstreamKey(checkout, repo);
			if (!key) {
				// PR checkouts recovered from GitHub's archived refs intentionally
				// have no upstream. Keep the explicit PR link only while the
				// checkout HEAD still matches the selected PR head.
				if (
					this.pullRequestHeadMatches(checkout.pullRequestId, checkout.headSha)
				) {
					continue;
				}
				if (checkout.pullRequestId) this.setCheckoutPullRequest(checkout, null);
				continue;
			}
			const rawMatch = keyToPullRequest.get(key);
			// A head=<default> PR that is merged or closed is a past promotion
			// (e.g. main -> staging), never the default-branch workspace's work.
			const isPastPromotion =
				!!rawMatch &&
				!rawMatch.isOpen &&
				this.tracksBaseDefaultBranch(checkout, repo);
			if (this.tracksBaseDefaultBranch(checkout, repo)) {
				this.forgetPastPromotionLinks(checkout.workspaceId, repositoryId, repo);
			}
			// A PR the user unlinked stays unlinked; a different PR still links.
			const match =
				rawMatch?.id === checkout.suppressedPullRequestId || isPastPromotion
					? undefined
					: rawMatch;
			if (match) {
				this.setCheckoutPullRequest(checkout, match.id);
				// The sweep re-asserts the link every pass, so this also heals
				// history rows for links that predate the table.
				this.recordWorkspacePullRequestLink(
					checkout.workspaceId,
					match.id,
					Date.now(),
				);
				continue;
			}

			if (failedKeys.has(key)) continue;

			if (checkout.pullRequestId) this.setCheckoutPullRequest(checkout, null);
		}
	}

	private async getRepositoryIdentity(
		repositoryId: string,
	): Promise<NormalizedRepoIdentity | null> {
		const repository = this.db
			.select()
			.from(repositories)
			.where(eq(repositories.id, repositoryId))
			.get();
		if (!repository) return null;

		let identity: Omit<NormalizedRepoIdentity, "defaultBranch">;
		if (
			repository.provider === "github" &&
			repository.owner &&
			repository.repoName &&
			repository.url &&
			repository.remoteName
		) {
			identity = {
				provider: "github",
				owner: repository.owner,
				name: repository.repoName,
				url: repository.url,
				remoteName: repository.remoteName,
			};
		} else {
			const remoteName = "origin";
			let remoteUrl: string;
			// The construct sits inside the try: a repoPath that vanished from
			// disk throws GitConstructError, which is "no repo" here, not a
			// refresh failure to warn about every sweep.
			try {
				const git = await this.git(repository.repoPath, {
					env: gitCeilingEnv(repository.repoPath),
				});
				const value = await git.remote(["get-url", remoteName]);
				if (typeof value !== "string") {
					return null;
				}
				remoteUrl = value.trim();
			} catch {
				return null;
			}

			const parsedRemote = parseGitHubRemote(remoteUrl);
			if (!parsedRemote) return null;

			this.db
				.update(repositories)
				.set({
					provider: parsedRemote.provider,
					owner: parsedRemote.owner,
					repoName: parsedRemote.name,
					url: parsedRemote.url,
					remoteName,
				})
				.where(eq(repositories.id, repositoryId))
				.run();

			identity = { ...parsedRemote, remoteName };
		}

		const defaultBranch = await this.resolveDefaultBranch(repository.repoPath);
		return { ...identity, defaultBranch };
	}

	// Shared origin/HEAD resolver; a repo-open failure disables the guard
	// rather than aborting the whole refresh.
	private async resolveDefaultBranch(repoPath: string): Promise<string | null> {
		try {
			return await resolveDefaultBranchName(await this.git(repoPath));
		} catch {
			return null;
		}
	}

	// Base repo only, so fork / `gh pr checkout` renames whose head is
	// `<default>` are not treated as tracking the default branch.
	private tracksBaseDefaultBranch(
		checkout: CheckoutRow,
		repo: NormalizedRepoIdentity,
	): boolean {
		return (
			repo.defaultBranch !== null &&
			(checkout.upstreamBranch ?? checkout.branch) === repo.defaultBranch &&
			checkout.upstreamOwner?.toLowerCase() === repo.owner.toLowerCase() &&
			checkout.upstreamRepo?.toLowerCase() === repo.name.toLowerCase()
		);
	}

	// Guard: a checkout that merely tracks `origin/<default>` (branched off it,
	// never pushed) must not key on `<default>` and grab a head=<default> PR —
	// only a checkout on the default branch may.
	private effectiveUpstreamKey(
		checkout: CheckoutRow,
		repo: NormalizedRepoIdentity,
	): string | null {
		if (
			this.tracksBaseDefaultBranch(checkout, repo) &&
			checkout.branch !== repo.defaultBranch
		) {
			return null;
		}
		return upstreamKey(
			checkout.upstreamOwner,
			checkout.upstreamRepo,
			checkout.upstreamBranch ?? checkout.branch,
		);
	}

	private findPullRequestRow(
		repo: NormalizedRepoIdentity,
		prNumber: number,
	): PullRequestRow | undefined {
		return this.db.query.pullRequests
			.findFirst({
				where: and(
					eq(pullRequests.repoProvider, repo.provider),
					eq(pullRequests.repoOwner, repo.owner),
					eq(pullRequests.repoName, repo.name),
					eq(pullRequests.prNumber, prNumber),
				),
			})
			.sync();
	}

	private findPullRequestRowById(id: string): PullRequestRow | undefined {
		return this.db.query.pullRequests
			.findFirst({ where: eq(pullRequests.id, id) })
			.sync();
	}

	private pullRequestHeadMatches(
		pullRequestId: string | null,
		headSha: string | null,
	): boolean {
		if (!pullRequestId || !headSha) return false;
		const pr = this.findPullRequestRowById(pullRequestId);
		return pr?.headSha.toLowerCase() === headSha.trim().toLowerCase();
	}

	private upsertPullRequestRow({
		existing,
		repositoryId,
		repo,
		prNumber,
		url,
		title,
		state,
		isDraft,
		headBranch,
		headSha,
		mergedAt,
		reviewDecision,
		checksStatus,
		checksJson,
		lastFetchedAt,
		error,
		now,
	}: {
		existing: PullRequestRow | undefined;
		repositoryId: string;
		repo: NormalizedRepoIdentity;
		prNumber: number;
		url: string;
		title: string;
		state: PullRequestState;
		isDraft: boolean;
		headBranch: string;
		headSha: string;
		/** GitHub's merged_at as epoch ms; null when the source has none. */
		mergedAt: number | null;
		reviewDecision: ReviewDecision;
		checksStatus: ChecksStatus;
		checksJson: string;
		lastFetchedAt: number | null;
		error: string | null;
		now: number;
	}): string {
		const rowId = existing?.id ?? randomUUID();
		const data = {
			repositoryId,
			repoProvider: repo.provider,
			repoOwner: repo.owner,
			repoName: repo.name,
			prNumber,
			url,
			title,
			state,
			isDraft,
			headBranch,
			headSha,
			reviewDecision,
			checksStatus,
			checksJson,
			// GitHub's merged_at wins, so a PR merged on day D but first seen on
			// D+3 is attributed to D. A row stamped at observation time heals
			// when that PR head is fetched again; fetches cover heads of
			// unarchived active workspaces, so other rows keep what they have.
			// The stored value is the fallback for a source with no usable
			// timestamp; a merged row with neither takes the observation time,
			// keeping every merged row visible to "merged in the last N days"
			// windows.
			mergedAt:
				mergedAt ?? existing?.mergedAt ?? (state === "merged" ? now : null),
			lastFetchedAt,
			error,
			updatedAt: now,
		};

		if (existing) {
			this.db
				.update(pullRequests)
				.set(data)
				.where(eq(pullRequests.id, rowId))
				.run();
		} else {
			this.db
				.insert(pullRequests)
				.values({
					id: rowId,
					createdAt: now,
					...data,
				})
				.run();
		}

		return rowId;
	}

	/**
	 * Runs a GitHub lookup through `gh` with an Octokit fallback, behind the
	 * availability gate. A transport failure from `gh` (DNS, timeout, refused)
	 * skips the fallback: Octokit would hit the same network and hang the same
	 * way. HTTP failures still fall through to Octokit, which may hold a
	 * different credential with its own quota; only when that fails too is
	 * the answer (rate limit, rejected credential) a property of this host.
	 */
	private async fetchFromGitHub<T>(
		what: string,
		context: Record<string, unknown>,
		viaGh: () => Promise<T>,
		viaOctokit: () => Promise<T>,
		options: { probe?: boolean } = {},
	): Promise<T> {
		// An explicit refresh (PR just created, user asked) is allowed through a
		// hold: it is one call, and its success is what reopens the gate early
		// once the network is back.
		if (!options.probe) this.githubGate.assertReachable();
		try {
			const result = await viaGh();
			this.githubGate.recordSuccess();
			return result;
		} catch (ghError) {
			if (isGitHubUnreachableError(ghError)) {
				this.noteGitHubFailure(ghError);
				throw ghError;
			}
			console.warn(
				`[host-service:pull-request-runtime] gh ${what} failed; falling back to Octokit`,
				{ ...context, error: ghError },
			);
		}
		try {
			const result = await viaOctokit();
			this.githubGate.recordSuccess();
			return result;
		} catch (octokitError) {
			this.noteGitHubFailure(octokitError);
			throw octokitError;
		}
	}

	/** Trips the gate on a host-wide failure and says so once per hold. */
	private noteGitHubFailure(error: unknown): void {
		const hold = this.githubGate.recordFailure(error);
		if (!hold?.opened) return;
		console.warn(
			`[host-service:pull-request-runtime] GitHub ${hold.reason}; holding GitHub lookups for ${Math.round(hold.holdMs / 1000)}s`,
			{ error },
		);
		if (this.holdRecoveryTimer) clearTimeout(this.holdRecoveryTimer);
		this.holdRecoveryTimer = setTimeout(() => {
			this.holdRecoveryTimer = null;
			void this.refreshEligibleRepositories();
		}, hold.holdMs + 1_000);
		this.holdRecoveryTimer.unref?.();
	}

	// Keep failed promises cached for the full TTL so subsequent polls share
	// the rejection without firing new GitHub calls. Evicting on every error
	// caused a self-perpetuating storm under rate-limit / abuse-detection
	// responses: the failure invalidated the cache, the next 20s tick
	// retried, hit the same 403, and re-evicted. Network blips heal at the
	// next TTL boundary instead. Gate-held calls are the exception: they never
	// reached GitHub, and must retry as soon as another lookup restores access.
	private cachedGitHubFetch<T>(
		cache: Map<
			string,
			{
				promise: Promise<T>;
				fetchedAt: number;
				consecutiveFailures: number;
				fingerprint?: string;
			}
		>,
		cacheKey: string,
		options: { bypassCache?: boolean; fingerprint?: string },
		fetcher: () => Promise<T>,
	): Promise<T> {
		const existing = cache.get(cacheKey);
		// A fingerprint names the version of the thing cached (a PR's head
		// SHA): a different one is a miss and a fresh failure streak, while
		// the key stays bounded by identity rather than growing per version.
		const cached =
			existing && existing.fingerprint === options.fingerprint
				? existing
				: undefined;
		if (!options.bypassCache && cached) {
			const ttl = Math.min(
				REPO_PULL_REQUEST_CACHE_TTL_MS * 2 ** cached.consecutiveFailures,
				REPO_PULL_REQUEST_CACHE_MAX_TTL_MS,
			);
			if (Date.now() - cached.fetchedAt < ttl) {
				return cached.promise;
			}
		}

		// Carry the failure streak forward so an in-flight retry keeps the
		// backed-off TTL until it actually resolves.
		const entry = {
			promise: fetcher(),
			fetchedAt: Date.now(),
			consecutiveFailures: cached?.consecutiveFailures ?? 0,
			fingerprint: options.fingerprint,
		};
		// The rejection observer also silences unhandledRejection warnings;
		// real consumers observe it via their own await on the cached promise.
		entry.promise.then(
			() => {
				entry.consecutiveFailures = 0;
			},
			(error: unknown) => {
				// A gate hold is not this entry's failure: nothing was asked of
				// GitHub. Drop it so the first call after the gate reopens fetches
				// instead of serving a backed-off rejection for up to 30 min.
				if (error instanceof GitHubUnavailableError) {
					if (cache.get(cacheKey) === entry) cache.delete(cacheKey);
					return;
				}
				// Re-anchor at the failure: a fetch that out-lives its own backoff
				// window before rejecting must not be retried immediately.
				entry.fetchedAt = Date.now();
				entry.consecutiveFailures += 1;
			},
		);
		cache.set(cacheKey, entry);
		return entry.promise;
	}

	private async getCachedPullRequestByHead(
		repo: NormalizedRepoIdentity,
		head: GitHubPullRequestHeadRef,
		options: { bypassCache?: boolean } = {},
	): Promise<GitHubPullRequestNode | null> {
		// Branch stays case-sensitive so two case-variant branches can't share
		// a cache entry and return each other's PR.
		const cacheKey = [
			repo.owner.toLowerCase(),
			repo.name.toLowerCase(),
			head.owner.toLowerCase(),
			head.repo.toLowerCase(),
			head.branch,
		].join("/");
		return this.cachedGitHubFetch(
			this.pullRequestHeadCache,
			cacheKey,
			options,
			() =>
				this.fetchFromGitHub(
					"PR head lookup",
					{ owner: repo.owner, name: repo.name, head },
					() =>
						fetchPullRequestByHeadFromGh(
							this.execGh,
							{ owner: repo.owner, name: repo.name },
							head,
						),
					async () =>
						fetchPullRequestByHead(
							await this.github(),
							{ owner: repo.owner, name: repo.name },
							head,
						),
					{ probe: options.bypassCache === true },
				),
		);
	}

	private getCachedPullRequestDetails(
		repo: NormalizedRepoIdentity,
		node: GitHubPullRequestNode,
		options: { bypassCache?: boolean } = {},
	): Promise<PullRequestDetails> {
		// One entry per PR; the head SHA is its fingerprint, so a new push
		// refetches at once while approvals and check runs on the same SHA
		// ride the TTL.
		const cacheKey = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}#${node.number}`;
		const context = {
			owner: repo.owner,
			name: repo.name,
			prNumber: node.number,
		};
		return this.cachedGitHubFetch(
			this.pullRequestDetailsCache,
			cacheKey,
			{ ...options, fingerprint: node.headRefOid },
			async () => {
				const [reviewDecision, checks] = await this.fetchFromGitHub(
					"PR review/check lookup",
					context,
					() =>
						Promise.all([
							fetchPullRequestReviewDecisionFromGh(
								this.execGh,
								repo,
								node.number,
								node.state,
							),
							fetchPullRequestChecksFromGh(this.execGh, repo, node.headRefOid),
						]),
					async () => {
						const octokit = await this.github();
						return Promise.all([
							fetchPullRequestReviewDecision(
								octokit,
								repo,
								node.number,
								node.state,
							),
							fetchPullRequestChecks(octokit, repo, node.headRefOid),
						]);
					},
					{ probe: options.bypassCache === true },
				);
				// Merge-queue detection stays on its own error boundary: only open,
				// non-draft PRs can be queued, and the `mergeQueueEntry` GraphQL
				// field is absent on older GitHub Enterprise schemas. Coupling it
				// with the fetch above would let that failure stale review/checks.
				let isInMergeQueue: boolean | null = null;
				if (node.state === "OPEN" && !node.isDraft) {
					try {
						isInMergeQueue = await this.fetchFromGitHub(
							"PR merge-queue lookup",
							context,
							() =>
								fetchPullRequestMergeQueueStateFromGh(
									this.execGh,
									repo,
									node.number,
								),
							async () =>
								fetchPullRequestMergeQueueState(
									await this.github(),
									repo,
									node.number,
								),
							{ probe: options.bypassCache === true },
						);
					} catch (error) {
						console.warn(
							"[host-service:pull-request-runtime] Failed to fetch PR merge-queue state",
							{ ...context, error },
						);
					}
				}
				return { reviewDecision, checks, isInMergeQueue };
			},
		);
	}

	// Deliberately narrow: repo-wide listing was removed in #4268/#4291 (the
	// GraphQL sweep 504'd on large repos). This is a shallow `pulls?state=open`
	// page, no checks, once per repo per TTL, only when a per-head lookup missed.
	private async getCachedOpenPullRequests(
		repo: NormalizedRepoIdentity,
		options: { bypassCache?: boolean } = {},
	): Promise<GitHubPullRequestNode[]> {
		const cacheKey = `${repo.owner.toLowerCase()}/${repo.name.toLowerCase()}`;
		return this.cachedGitHubFetch(
			this.openPullRequestsCache,
			cacheKey,
			options,
			() =>
				this.fetchFromGitHub(
					"open-PR sweep",
					{ owner: repo.owner, name: repo.name },
					() =>
						fetchOpenPullRequestsFromGh(this.execGh, {
							owner: repo.owner,
							name: repo.name,
						}),
					async () =>
						fetchOpenPullRequests(await this.github(), {
							owner: repo.owner,
							name: repo.name,
						}),
					{ probe: options.bypassCache === true },
				),
		);
	}

	private async fetchRepoPullRequests(
		repositoryId: string,
		repo: NormalizedRepoIdentity,
		wantedRefs: Map<string, GitHubPullRequestHeadRef>,
		options: { bypassCache?: boolean } = {},
	): Promise<{
		matched: Map<string, { id: string; isOpen: boolean }>;
		failedKeys: Set<string>;
	}> {
		const matched = new Map<string, { id: string; isOpen: boolean }>();
		const failedKeys = new Set<string>();
		if (wantedRefs.size === 0) return { matched, failedKeys };

		const latestByKey = new Map<string, GitHubPullRequestNode>();
		await Promise.all(
			Array.from(wantedRefs.entries()).map(async ([key, head]) => {
				try {
					const node = await this.getCachedPullRequestByHead(
						repo,
						head,
						options,
					);
					if (!node) return;

					const nodeKey = upstreamKey(
						node.headRepositoryOwner?.login ?? null,
						node.headRepository?.name ?? null,
						node.headRefName,
					);
					if (nodeKey === key) latestByKey.set(key, node);
				} catch (error) {
					failedKeys.add(key);
					console.warn(
						"[host-service:pull-request-runtime] Failed to fetch PR by head",
						{
							repositoryId,
							owner: repo.owner,
							name: repo.name,
							head,
							error,
						},
					);
				}
			}),
		);

		// GitHub's `head=` filter is case-sensitive on the branch component, so
		// a workspace whose local branch casing drifted from the PR's
		// headRefName gets nothing from the per-head lookups above. Sweep the
		// repo's open PRs once and fill the gaps case-insensitively.
		const unmatchedKeys = Array.from(wantedRefs.keys()).filter(
			(key) => !latestByKey.has(key) && !failedKeys.has(key),
		);
		if (unmatchedKeys.length > 0) {
			try {
				const openNodes = await this.getCachedOpenPullRequests(repo, options);
				// The one place drift is tolerated: index open PRs by a lowercased
				// key. latestByKey stays keyed by the exact workspace key, so link
				// assignment downstream is unchanged.
				const openByLowerKey = new Map<string, GitHubPullRequestNode>();
				for (const node of openNodes) {
					const nodeKey = upstreamKey(
						node.headRepositoryOwner?.login ?? null,
						node.headRepository?.name ?? null,
						node.headRefName,
					);
					if (!nodeKey) continue;
					const lower = nodeKey.toLowerCase();
					// Sweep is sorted by updated desc; first hit per key wins.
					if (!openByLowerKey.has(lower)) openByLowerKey.set(lower, node);
				}
				for (const key of unmatchedKeys) {
					const node = openByLowerKey.get(key.toLowerCase());
					if (node) latestByKey.set(key, node);
				}
			} catch (error) {
				// Treat the whole sweep as failed lookups so existing links are
				// kept rather than cleared on a transient error.
				for (const key of unmatchedKeys) failedKeys.add(key);
				console.warn(
					"[host-service:pull-request-runtime] Open-PR sweep failed",
					{ repositoryId, owner: repo.owner, name: repo.name, error },
				);
			}
		}

		const now = Date.now();

		const detailsByNumber = new Map<number, PullRequestDetails>();
		await Promise.all(
			Array.from(latestByKey.values()).map(async (node) => {
				try {
					detailsByNumber.set(
						node.number,
						await this.getCachedPullRequestDetails(repo, node, options),
					);
				} catch (error) {
					console.warn(
						"[host-service:pull-request-runtime] Failed to fetch PR review/check state",
						{
							repositoryId,
							owner: repo.owner,
							name: repo.name,
							prNumber: node.number,
							error,
						},
					);
				}
			}),
		);

		for (const [key, node] of latestByKey) {
			const existing = this.findPullRequestRow(repo, node.number);
			// A failed fetch keeps the last-known state rather than blanking it.
			const details = detailsByNumber.get(node.number);
			const checks = details
				? parseCheckContexts(details.checks)
				: parseChecksJson(existing?.checksJson ?? null);
			const reviewDecision = details
				? mapReviewDecision(details.reviewDecision)
				: coerceReviewDecision(existing?.reviewDecision ?? null);
			const isInMergeQueue =
				details?.isInMergeQueue ??
				coercePullRequestState(existing?.state ?? null) === "queued";
			const rowId = this.upsertPullRequestRow({
				existing,
				repositoryId,
				prNumber: node.number,
				repo,
				url: node.url,
				title: node.title,
				state: mapPullRequestState(node.state, node.isDraft, isInMergeQueue),
				isDraft: node.isDraft,
				headBranch: node.headRefName,
				headSha: node.headRefOid,
				mergedAt: node.mergedAt,
				reviewDecision,
				checksStatus: computeChecksStatus(checks),
				checksJson: JSON.stringify(checks),
				lastFetchedAt: now,
				error: null,
				now,
			});

			matched.set(key, { id: rowId, isOpen: node.state === "OPEN" });
		}

		return { matched, failedKeys };
	}
}
