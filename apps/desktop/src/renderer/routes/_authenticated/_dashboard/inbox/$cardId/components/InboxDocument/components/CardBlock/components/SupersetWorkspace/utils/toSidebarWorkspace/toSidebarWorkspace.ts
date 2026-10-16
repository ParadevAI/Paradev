import type { DashboardSidebarWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/types";
import type { SupersetWorkspaceView } from "../../types";

const REVIEW_DECISION: Record<
	string,
	NonNullable<DashboardSidebarWorkspace["pullRequest"]>["reviewDecision"]
> = {
	APPROVED: "approved",
	CHANGES_REQUESTED: "changes_requested",
	REVIEW_REQUIRED: "pending",
};

/** The card's workspace in the shape the sidebar's rows and hover card take. */
export function toSidebarWorkspace(
	view: SupersetWorkspaceView,
	localMachineId: string | null,
): DashboardSidebarWorkspace {
	const pr = view.pullRequest;
	return {
		id: view.id,
		projectId: null,
		hostId: view.host?.id ?? "cloud",
		hostType:
			view.location === "cloud"
				? "cloud"
				: view.host?.id === localMachineId
					? "local-device"
					: "remote-device",
		type: "worktree",
		hostIsOnline: null,
		accentColor: null,
		name: view.name,
		branch: view.branch ?? "",
		pullRequest: pr
			? {
					url: pr.url,
					number: pr.number,
					title: pr.title,
					state: pr.isDraft && pr.state === "open" ? "draft" : pr.state,
					reviewDecision: pr.reviewDecision
						? (REVIEW_DECISION[pr.reviewDecision] ?? null)
						: null,
					checksStatus: pr.checksStatus,
					checks: pr.checks,
				}
			: null,
		repoUrl: view.repo ? `https://github.com/${view.repo}` : null,
		branchExistsOnRemote: Boolean(pr),
		previewUrl: null,
		needsRebase: null,
		behindCount: null,
		createdAt: new Date(view.createdAt),
		updatedAt: new Date(view.createdAt),
		lastActivityAt: null,
		taskId: null,
		isPinned: false,
		pendingTransaction: null,
	};
}
