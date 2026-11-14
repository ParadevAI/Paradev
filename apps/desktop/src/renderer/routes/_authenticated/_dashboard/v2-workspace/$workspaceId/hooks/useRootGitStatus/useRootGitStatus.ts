import { useMemo } from "react";
import { useCheckoutGitStatuses } from "../../providers/WorkspaceGitStatusProvider";
import { useWorkspaceCheckouts } from "../../state/activeRepositoryStore";
import { rootGitStatus } from "./utils/rootGitStatus";

/** Git status for a file tree rooted at the workspace folder. */
export function useRootGitStatus(workspaceId: string) {
	const checkouts = useWorkspaceCheckouts(workspaceId);
	const statuses = useCheckoutGitStatuses(
		checkouts.length > 0
			? checkouts.map((checkout) => checkout.repositoryId)
			: [undefined],
	);
	return useMemo(
		() =>
			rootGitStatus(
				statuses.map((status, index) => ({
					name: checkouts[index]?.name ?? "",
					data: status.data,
				})),
			),
		[checkouts, statuses],
	);
}
