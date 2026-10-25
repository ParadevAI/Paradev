import type {
	PullRequestCheck,
	PullRequestChecksStatus,
	PullRequestReviewDecision,
	PullRequestState,
} from "@superset/shared/pull-request";
import { buildCloudSidebarWorkspaces } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarData/buildCloudSidebarWorkspaces";
import type { CloudSidebarEntry } from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { isInCloudSidebar } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
import { type PaneStatus, pickHigherStatus } from "shared/tabs-types";
import type { AccessibleV2Workspace, V2WorkspacePrSummary } from "./types";

export interface CloudAccessibleWorkspaceInput {
	id: string;
	name: string;
	branch: string;
	status: "provisioning" | "ready" | "failed" | "deleted";
	agentStatus: "review" | "working" | "failed" | "permission" | null;
	agentStatusAt: Date | null;
	createdBy: { userId: string; name: string; image: string | null } | null;
	createdAt: Date;
	updatedAt: Date;
	deletedAt: Date | null;
}

export interface CloudAccessiblePullRequestInput {
	url: string;
	number: number;
	title: string;
	state: PullRequestState;
	isDraft: boolean;
	reviewDecision: PullRequestReviewDecision;
	checksStatus: PullRequestChecksStatus;
	checks: PullRequestCheck[];
	mergedAt: Date | null;
}

export interface CloudAccessibleProjectInput {
	id: string;
	name: string;
	iconUrl: string | null;
	githubOwner: string | null;
	githubRepoName: string | null;
}

export interface BuildCloudAccessibleWorkspacesParams {
	cloudWorkspaces: CloudAccessibleWorkspaceInput[];
	userId: string | null;
	/** Projects a host serves, so a cloud row files under the one with its repo. */
	projects: CloudAccessibleProjectInput[];
	/** Primary repo (`owner/name`) per cloud workspace id. */
	repoFullNameById: ReadonlyMap<string, string>;
	/** Per cloud workspace id, the one to show first. */
	pullRequestsById: ReadonlyMap<
		string,
		readonly CloudAccessiblePullRequestInput[]
	>;
	/** Who opted a teammate's row into their sidebar. */
	sidebarEntries: Record<string, CloudSidebarEntry>;
	/** workspaceId → the reported status timestamp the user has seen. */
	workspaceSeenAt: Record<string, number>;
	/** Workspaces marked unread from the sidebar. */
	manualUnread: Record<string, true>;
	/** Name of the stand-in project for rows whose repo isn't known yet. */
	unknownRepoProjectName: string;
	/** What the Where column calls the cloud. */
	cloudHostName: string;
}

const NO_BRANCHES: ReadonlyMap<string, string> = new Map();

function toPrSummary(
	pullRequest: CloudAccessiblePullRequestInput,
): V2WorkspacePrSummary {
	return {
		prNumber: pullRequest.number,
		title: pullRequest.title,
		url: pullRequest.url,
		state:
			pullRequest.isDraft && pullRequest.state === "open"
				? "draft"
				: pullRequest.state,
		checksStatus: pullRequest.checksStatus,
		reviewDecision: pullRequest.reviewDecision ?? "pending",
		checks: pullRequest.checks.map((check) => ({
			name: check.name,
			status: check.status,
			url: check.url ?? undefined,
		})),
		mergedAt: pullRequest.mergedAt?.getTime() ?? null,
	};
}

/**
 * The cloud reports one status per workspace; `review` stays until the user
 * has looked, the same way a host terminal's Stop does. A manual unread mark
 * reads as `review` too, as on host rows.
 */
function cloudAgentStatus(
	workspace: CloudAccessibleWorkspaceInput,
	seenAt: number | undefined,
	isMarkedUnread: boolean,
): PaneStatus {
	let reported: PaneStatus = workspace.agentStatus ?? "idle";
	if (reported === "review") {
		const reportedAt = workspace.agentStatusAt?.getTime() ?? null;
		if (reportedAt !== null && (seenAt ?? 0) >= reportedAt) reported = "idle";
	}
	return pickHigherStatus(reported, isMarkedUnread ? "review" : "idle");
}

/**
 * Turns the cloud workspace list into rows the Workspaces view can show
 * beside host rows. Each files under the project whose GitHub repo it was
 * created from, with the same stand-in projects the sidebar makes for a repo
 * no host has a checkout of, so the two surfaces agree on where a row lives.
 */
export function buildCloudAccessibleWorkspaces({
	cloudWorkspaces,
	userId,
	projects,
	repoFullNameById,
	pullRequestsById,
	sidebarEntries,
	workspaceSeenAt,
	manualUnread,
	unknownRepoProjectName,
	cloudHostName,
}: BuildCloudAccessibleWorkspacesParams): AccessibleV2Workspace[] {
	const layout = buildCloudSidebarWorkspaces({
		cloudWorkspaces,
		userId,
		projects,
		repoFullNameById,
		branchById: NO_BRANCHES,
		pullRequestsById: new Map(),
		unknownRepoProjectName,
	});
	const projectById = new Map(projects.map((project) => [project.id, project]));
	const projectOfWorkspace = new Map<
		string,
		{ id: string; name: string; iconUrl: string | null }
	>();
	for (const [projectId, rows] of layout.byProjectId) {
		const project = projectById.get(projectId);
		if (!project) continue;
		for (const row of rows) projectOfWorkspace.set(row.id, project);
	}
	for (const repoProject of layout.repoProjects) {
		for (const row of repoProject.cloudWorkspaces) {
			projectOfWorkspace.set(row.id, repoProject);
		}
	}

	return cloudWorkspaces.flatMap((workspace): AccessibleV2Workspace[] => {
		const project = projectOfWorkspace.get(workspace.id);
		if (!project) return [];
		const pullRequest = pullRequestsById.get(workspace.id)?.[0];
		const pr = pullRequest ? toPrSummary(pullRequest) : null;
		const isArchived = workspace.status === "deleted";
		const reportedAt = workspace.agentStatusAt?.getTime() ?? null;
		return [
			{
				id: workspace.id,
				name: getV2WorkspaceDisplayName(workspace),
				branch: workspace.branch,
				type: "worktree",
				createdAt: workspace.createdAt,
				createdByUserId: workspace.createdBy?.userId ?? null,
				createdByName: workspace.createdBy?.name ?? null,
				createdByImage: workspace.createdBy?.image ?? null,
				isCreatedByCurrentUser:
					userId !== null && workspace.createdBy?.userId === userId,
				projectId: project.id,
				projectName: project.name,
				projectIconUrl: project.iconUrl,
				hostId: workspace.id,
				hostName: cloudHostName,
				hostIsOnline: true,
				hostType: "cloud",
				isInSidebar: isInCloudSidebar(
					workspace,
					sidebarEntries[workspace.id],
					userId,
				),
				pr,
				agentStatus: cloudAgentStatus(
					workspace,
					workspaceSeenAt[workspace.id],
					Boolean(manualUnread[workspace.id]),
				),
				lastAgentEventAt: reportedAt,
				diffStats: null,
				sandboxStatus:
					workspace.status === "provisioning" || workspace.status === "failed"
						? workspace.status
						: null,
				seenMarks: { terminals: [], reportedAt },
				archivedAt: isArchived
					? (workspace.deletedAt ?? workspace.updatedAt).getTime()
					: null,
				archiveReason: isArchived
					? pr?.state === "merged"
						? "merged"
						: "deleted"
					: null,
			},
		];
	});
}
