import { sortByLastAgentMessage } from "@superset/shared/cloud-workspace-groups";
import type {
	PullRequestCheck,
	PullRequestChecksStatus,
	PullRequestReviewDecision,
	PullRequestState,
} from "@superset/shared/pull-request";
import { resolveProjectIconUrl } from "renderer/hooks/host-projects/resolveProjectIconUrl";
import { cloudRepoProjectId } from "renderer/lib/github/cloudRepoProjectId";
import { cloudPullRequestRefKey } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import { getV2WorkspaceDisplayName } from "renderer/utils/getV2WorkspaceDisplayName";
import type {
	DashboardSidebarWorkspace,
	DashboardSidebarWorkspacePullRequest,
} from "../../types";

export interface CloudSidebarWorkspaceInput {
	id: string;
	name: string;
	branch: string;
	createdAt: Date;
	updatedAt: Date;
	agentStatusAt: Date | null;
	createdBy: { userId: string } | null;
	status?: "provisioning" | "ready" | "failed" | "deleted";
}

export interface CloudSidebarPullRequestInput {
	url: string;
	number: number;
	title: string;
	state: PullRequestState;
	isDraft: boolean;
	reviewDecision: PullRequestReviewDecision;
	checksStatus: PullRequestChecksStatus;
	checks: PullRequestCheck[];
}

export interface CloudSidebarProjectTarget {
	id: string;
	githubOwner: string | null;
	githubRepoName: string | null;
}

/**
 * A project standing in for a GitHub repo no host has a checkout of. Its id
 * is derived from the repo name so the ordinary placement rows (collapse,
 * hide, order) apply to it, and those rows require a uuid.
 */
export interface CloudSidebarRepoProject {
	id: string;
	name: string;
	githubOwner: string | null;
	githubRepoName: string | null;
	iconUrl: string | null;
	createdAt: Date;
	updatedAt: Date;
	cloudWorkspaces: DashboardSidebarWorkspace[];
}

export { cloudRepoProjectId };

function toSidebarPullRequest(
	pullRequest: CloudSidebarPullRequestInput,
): DashboardSidebarWorkspacePullRequest {
	return {
		url: pullRequest.url,
		number: pullRequest.number,
		title: pullRequest.title,
		state:
			pullRequest.isDraft && pullRequest.state === "open"
				? "draft"
				: pullRequest.state,
		reviewDecision: pullRequest.reviewDecision,
		checksStatus: pullRequest.checksStatus,
		checks: pullRequest.checks,
	};
}

export interface BuildCloudSidebarWorkspacesParams {
	cloudWorkspaces: CloudSidebarWorkspaceInput[];
	userId: string | null;
	projects: CloudSidebarProjectTarget[];
	/** Primary repo (`owner/name`) per cloud workspace id. */
	repoFullNameById: ReadonlyMap<string, string>;
	/** Live branch per cloud workspace id, for the ones whose sandbox is a host. */
	branchById: ReadonlyMap<string, string>;
	/** Keyed by {@link cloudPullRequestRefKey}. */
	pullRequestsByRef: ReadonlyMap<string, CloudSidebarPullRequestInput>;
	/** Name of the stand-in project for rows whose repo isn't known yet. */
	unknownRepoProjectName: string;
}

export interface CloudSidebarWorkspacesLayout {
	/** Rows filed under an existing project, by project id. */
	byProjectId: Map<string, DashboardSidebarWorkspace[]>;
	/** Stand-in projects for repos no existing project has, in first-seen order. */
	repoProjects: CloudSidebarRepoProject[];
}

/**
 * Turns the cloud workspace list into sidebar rows, each filed under the
 * project whose GitHub repo it was created from. The caller passes only the
 * rows to show (the Cloud section's rule: mine, or opted in); they keep its
 * order (latest agent message first). A repo with no project gets a stand-in
 * project of its own.
 */
export function buildCloudSidebarWorkspaces({
	cloudWorkspaces,
	userId,
	projects,
	repoFullNameById,
	branchById,
	pullRequestsByRef,
	unknownRepoProjectName,
}: BuildCloudSidebarWorkspacesParams): CloudSidebarWorkspacesLayout {
	const projectIdByRepo = new Map<string, string>();
	for (const project of projects) {
		if (!project.githubOwner || !project.githubRepoName) continue;
		const key =
			`${project.githubOwner}/${project.githubRepoName}`.toLowerCase();
		if (!projectIdByRepo.has(key)) projectIdByRepo.set(key, project.id);
	}

	const shown = sortByLastAgentMessage(cloudWorkspaces);

	const byProjectId = new Map<string, DashboardSidebarWorkspace[]>();
	const repoProjectsById = new Map<string, CloudSidebarRepoProject>();

	for (const workspace of shown) {
		const repoFullName = repoFullNameById.get(workspace.id) ?? null;
		const branch = branchById.get(workspace.id) ?? workspace.branch;
		const existingProjectId = repoFullName
			? projectIdByRepo.get(repoFullName.toLowerCase())
			: undefined;
		const projectId = existingProjectId ?? cloudRepoProjectId(repoFullName);
		const pullRequest = repoFullName
			? pullRequestsByRef.get(
					cloudPullRequestRefKey({ repoFullName, headBranch: branch }),
				)
			: undefined;

		const row: DashboardSidebarWorkspace = {
			id: workspace.id,
			projectId,
			hostId: workspace.id,
			hostType: "cloud",
			type: "worktree",
			hostIsOnline: null,
			accentColor: null,
			name: getV2WorkspaceDisplayName({ name: workspace.name, branch }),
			branch,
			pullRequest: pullRequest ? toSidebarPullRequest(pullRequest) : null,
			repoUrl: repoFullName ? `https://github.com/${repoFullName}` : null,
			branchExistsOnRemote: repoFullName !== null,
			previewUrl: null,
			needsRebase: null,
			behindCount: null,
			createdAt: workspace.createdAt,
			updatedAt: workspace.updatedAt,
			lastActivityAt: workspace.agentStatusAt?.getTime() ?? null,
			taskId: null,
			isPinned: false,
			pendingTransaction: null,
			isMine: userId !== null && workspace.createdBy?.userId === userId,
			sandboxStatus:
				workspace.status === "provisioning" || workspace.status === "failed"
					? workspace.status
					: null,
		};

		if (existingProjectId) {
			byProjectId.set(existingProjectId, [
				...(byProjectId.get(existingProjectId) ?? []),
				row,
			]);
			continue;
		}

		const repoProject = repoProjectsById.get(projectId);
		if (repoProject) {
			repoProject.cloudWorkspaces.push(row);
			if (workspace.createdAt < repoProject.createdAt) {
				repoProject.createdAt = workspace.createdAt;
			}
			if (workspace.updatedAt > repoProject.updatedAt) {
				repoProject.updatedAt = workspace.updatedAt;
			}
			continue;
		}
		const [githubOwner = null, githubRepoName = null] =
			repoFullName?.split("/") ?? [];
		repoProjectsById.set(projectId, {
			id: projectId,
			name: githubRepoName ?? unknownRepoProjectName,
			githubOwner,
			githubRepoName,
			iconUrl: resolveProjectIconUrl({ icon: null, repoOwner: githubOwner }),
			createdAt: workspace.createdAt,
			updatedAt: workspace.updatedAt,
			cloudWorkspaces: [row],
		});
	}

	return { byProjectId, repoProjects: [...repoProjectsById.values()] };
}
