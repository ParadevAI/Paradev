import { db } from "@superset/db/client";
import {
	cloudWorkspaceRepositories,
	cloudWorkspaces,
	environments,
	githubPullRequests,
	githubRepositories,
	users,
	v2Hosts,
} from "@superset/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { primaryRepository } from "../../../../lib/sandbox/repositories";
import { isVisibleTo } from "../../../cloud-workspace/access";
import { loadPresence } from "../../../cloud-workspace/cloud-workspace";
import {
	CardUnavailable,
	type SupersetPerson,
	type SupersetPullRequestView,
	type SupersetWorkspaceView,
} from "../types";
import { callWorkspaceHost } from "./workspaceHost";

export type WorkspaceRecord =
	| { location: "cloud"; row: typeof cloudWorkspaces.$inferSelect }
	| {
			location: "local";
			row: { id: string; organizationId: string; hostId: string };
	  };

export interface LoadedWorkspace {
	record: WorkspaceRecord;
	view: SupersetWorkspaceView;
	repositoryId: string | null;
}

async function person(userId: string | null): Promise<SupersetPerson | null> {
	if (!userId) return null;
	const row = await db.query.users.findFirst({
		where: eq(users.id, userId),
		columns: { id: true, name: true, image: true },
	});
	return row ?? null;
}

function checkStatus(
	status: string | null | undefined,
	conclusion: string | null | undefined,
): SupersetPullRequestView["checks"][number]["status"] {
	if (status !== "completed") return "pending";
	if (conclusion === "success") return "success";
	if (conclusion === "skipped" || conclusion === "neutral") return "skipped";
	if (conclusion === "cancelled") return "cancelled";
	return "failure";
}

/** The PR GitHub has for this branch, from the webhook-fed cache; the default branch never counts. */
export async function pullRequestFor(
	repository: { id: string; fullName: string; defaultBranch: string } | null,
	branch: string | null,
): Promise<SupersetPullRequestView | null> {
	if (!repository || !branch || branch === repository.defaultBranch)
		return null;
	const [row] = await db
		.select()
		.from(githubPullRequests)
		.where(
			and(
				eq(githubPullRequests.repositoryId, repository.id),
				eq(githubPullRequests.headBranch, branch),
			),
		)
		.orderBy(desc(githubPullRequests.updatedAt))
		.limit(1);
	if (!row) return null;
	return {
		repo: repository.fullName,
		number: row.prNumber,
		title: row.title,
		url: row.url,
		state: row.state as SupersetPullRequestView["state"],
		isDraft: row.isDraft,
		additions: row.additions,
		deletions: row.deletions,
		changedFiles: row.changedFiles,
		checksStatus: row.checksStatus as SupersetPullRequestView["checksStatus"],
		checks: (row.checks ?? []).map((check) => ({
			name: check.name,
			status: checkStatus(check.status, check.conclusion),
			url: check.detailsUrl ?? null,
		})),
		reviewDecision: row.reviewDecision,
	};
}

async function loadCloud(
	row: typeof cloudWorkspaces.$inferSelect,
): Promise<LoadedWorkspace> {
	const [repositories, environment, creator, presence] = await Promise.all([
		db
			.select({
				id: githubRepositories.id,
				fullName: githubRepositories.fullName,
				defaultBranch: githubRepositories.defaultBranch,
			})
			.from(cloudWorkspaceRepositories)
			.innerJoin(
				githubRepositories,
				eq(githubRepositories.id, cloudWorkspaceRepositories.repositoryId),
			)
			.where(eq(cloudWorkspaceRepositories.cloudWorkspaceId, row.id)),
		db.query.environments.findFirst({
			where: eq(environments.id, row.environmentId),
			columns: { hooksRepositoryId: true },
		}),
		person(row.createdByUserId),
		loadPresence(row.organizationId, [row.id]),
	]);
	const repository =
		primaryRepository(repositories, environment?.hooksRepositoryId) ?? null;
	const pullRequest = await pullRequestFor(repository, row.branch);
	return {
		record: { location: "cloud", row },
		repositoryId: repository?.id ?? null,
		view: {
			id: row.id,
			location: "cloud",
			name: row.name,
			branch: row.branch,
			repo: repository?.fullName ?? null,
			status: row.status,
			agentStatus: row.agentStatus,
			agentStatusAt: row.agentStatusAt?.toISOString() ?? null,
			createdAt: row.createdAt.toISOString(),
			createdBy: creator,
			host: null,
			presence: presence.map((p) => ({
				id: p.userId,
				name: p.name,
				image: p.image,
				lastSeenAt: p.lastSeenAt.toISOString(),
			})),
			pullRequest,
			changes:
				pullRequest?.additions != null &&
				pullRequest.deletions != null &&
				pullRequest.changedFiles != null
					? {
							additions: pullRequest.additions,
							deletions: pullRequest.deletions,
							files: pullRequest.changedFiles,
						}
					: null,
		},
	};
}

/** What host-service's `workspace.get` answers with, in the parts a card reads. */
interface HostWorkspace {
	id: string;
	name: string;
	branch: string;
	createdAt: string | Date;
	createdByUserId: string | null;
	upstreamOwner: string | null;
	upstreamRepo: string | null;
}

/** What host-service's `pullRequests.getByWorkspaces` answers with for one PR. */
interface HostPullRequest {
	url: string;
	number: number;
	title: string;
	state: "open" | "merged" | "closed" | "draft";
	reviewDecision: "approved" | "changes_requested" | "pending" | null;
	checksStatus: SupersetPullRequestView["checksStatus"];
	checks: SupersetPullRequestView["checks"];
}

/** The parts of host-service's `git.getStatus` that count changed lines. */
interface HostStatus {
	againstBase: HostFileChange[];
	staged: HostFileChange[];
	unstaged: HostFileChange[];
}

interface HostFileChange {
	path: string;
	additions: number | null;
	deletions: number | null;
}

/** Sums changes per path the way the sidebar's diff stats do, so the card and the row agree. */
function countChanges(status: HostStatus): SupersetWorkspaceView["changes"] {
	const byPath = new Map<string, HostFileChange>();
	for (const file of status.againstBase) byPath.set(file.path, file);
	for (const file of status.staged) byPath.set(file.path, file);
	for (const file of status.unstaged) byPath.set(file.path, file);
	let additions = 0;
	let deletions = 0;
	for (const file of byPath.values()) {
		additions += file.additions ?? 0;
		deletions += file.deletions ?? 0;
	}
	return { additions, deletions, files: byPath.size };
}

const REVIEW_DECISION: Record<string, string> = {
	approved: "APPROVED",
	changes_requested: "CHANGES_REQUESTED",
	pending: "REVIEW_REQUIRED",
};

/**
 * A workspace on someone's machine: the cloud does not keep these, so the
 * card asks the host it lives on, through the relay, for the row and its PR,
 * the same reads the sidebar makes.
 */
async function loadLocal(
	organizationId: string,
	readerId: string,
	workspaceId: string,
	hostId: string,
): Promise<LoadedWorkspace> {
	const record: WorkspaceRecord = {
		location: "local",
		row: { id: workspaceId, organizationId, hostId },
	};
	const [host, hosted, pulls, status] = await Promise.all([
		db.query.v2Hosts.findFirst({
			where: and(
				eq(v2Hosts.organizationId, organizationId),
				eq(v2Hosts.machineId, hostId),
			),
			columns: { machineId: true, name: true },
		}),
		callWorkspaceHost<{ id: string }, HostWorkspace>({
			record,
			userId: readerId,
			procedure: "workspace.get",
			input: { id: workspaceId },
			query: true,
		}),
		callWorkspaceHost<
			{ workspaceIds: string[] },
			{ workspaces: { pullRequest: HostPullRequest | null }[] }
		>({
			record,
			userId: readerId,
			procedure: "pullRequests.getByWorkspaces",
			input: { workspaceIds: [workspaceId] },
			query: true,
		}).catch(() => ({ workspaces: [] })),
		callWorkspaceHost<
			{ workspaceId: string; priority: "background" },
			HostStatus
		>({
			record,
			userId: readerId,
			procedure: "git.getStatus",
			input: { workspaceId, priority: "background" },
			query: true,
		}).catch(() => null),
	]);
	if (!host)
		throw new CardUnavailable(
			"gone",
			"That machine is not in this organization",
		);
	const repo =
		hosted.upstreamOwner && hosted.upstreamRepo
			? `${hosted.upstreamOwner}/${hosted.upstreamRepo}`
			: null;
	const pr = pulls.workspaces[0]?.pullRequest ?? null;
	return {
		record,
		repositoryId: null,
		view: {
			id: workspaceId,
			location: "local",
			name: hosted.name,
			branch: hosted.branch,
			repo,
			status: null,
			agentStatus: null,
			agentStatusAt: null,
			createdAt: new Date(hosted.createdAt).toISOString(),
			createdBy: await person(hosted.createdByUserId),
			host: { id: host.machineId, name: host.name },
			presence: [],
			pullRequest: pr
				? {
						repo: repo ?? "",
						number: pr.number,
						title: pr.title,
						url: pr.url,
						state: pr.state === "draft" ? "open" : pr.state,
						isDraft: pr.state === "draft",
						additions: null,
						deletions: null,
						changedFiles: null,
						checksStatus: pr.checksStatus,
						checks: pr.checks,
						reviewDecision: pr.reviewDecision
							? (REVIEW_DECISION[pr.reviewDecision] ?? null)
							: null,
					}
				: null,
			changes: status ? countChanges(status) : null,
		},
	};
}

/** A cloud workspace, or a local one on the named host, that the reader may see; else the card's unavailable state. */
export async function loadWorkspace(
	organizationId: string,
	readerId: string,
	workspaceId: string,
	hostId?: string,
): Promise<LoadedWorkspace> {
	const cloud = await db.query.cloudWorkspaces.findFirst({
		where: eq(cloudWorkspaces.id, workspaceId),
	});
	if (cloud) {
		if (
			cloud.organizationId !== organizationId ||
			!isVisibleTo(cloud, readerId)
		)
			throw new CardUnavailable("no_access", "That workspace is private");
		return loadCloud(cloud);
	}
	if (!hostId)
		throw new CardUnavailable("gone", "That workspace no longer exists");
	return loadLocal(organizationId, readerId, workspaceId, hostId);
}
