import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import type { CloudPullRequest } from "renderer/routes/_authenticated/_dashboard/hooks/useCloudPullRequests";
import type { SupersetWorkspaceView } from "renderer/routes/_authenticated/_dashboard/inbox/$cardId/components/InboxDocument/components/CardBlock/components/SupersetWorkspace";

/** A cloud workspace row in the shape the inbox cards draw a workspace from. */
export function cloudToWorkspaceView(
	workspace: CloudWorkspaceRow,
	repo: string | null,
	pullRequest: CloudPullRequest | null,
): SupersetWorkspaceView {
	return {
		id: workspace.id,
		location: "cloud",
		name: workspace.name,
		branch: workspace.branch,
		repo,
		status: workspace.status,
		agentStatus: workspace.agentStatus,
		agentStatusAt: workspace.agentStatusAt?.toISOString() ?? null,
		createdAt: workspace.createdAt.toISOString(),
		createdBy: workspace.createdBy
			? {
					id: workspace.createdBy.userId,
					name: workspace.createdBy.name,
					image: workspace.createdBy.image,
				}
			: null,
		host: null,
		presence: workspace.presence.map((person) => ({
			id: person.userId,
			name: person.name,
			image: person.image,
			lastSeenAt: person.lastSeenAt.toISOString(),
		})),
		pullRequest: pullRequest
			? {
					repo: repo ?? "",
					number: pullRequest.number,
					title: pullRequest.title,
					url: pullRequest.url,
					state: pullRequest.state,
					isDraft: pullRequest.isDraft,
					additions: pullRequest.additions,
					deletions: pullRequest.deletions,
					changedFiles: null,
					checksStatus: "none",
					checks: [],
					reviewDecision: null,
				}
			: null,
		changes:
			pullRequest &&
			pullRequest.additions !== null &&
			pullRequest.deletions !== null
				? {
						additions: pullRequest.additions,
						deletions: pullRequest.deletions,
						files: 0,
					}
				: null,
	};
}
