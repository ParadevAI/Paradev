import type { workspaceTrpc } from "@superset/workspace-client";
import { checkoutInput } from "../../../../utils/checkoutInput";

type GitUtils = Pick<
	ReturnType<typeof workspaceTrpc.useUtils>["git"],
	"getPullRequest" | "getBranchSyncStatus" | "listCommits"
>;

export function refreshCheckoutShipState(
	git: GitUtils,
	workspaceId: string,
	repositoryId: string | undefined,
): void {
	const scope = checkoutInput(workspaceId, repositoryId);
	void git.getPullRequest.invalidate(scope);
	void git.getBranchSyncStatus.invalidate(scope);
	void git.listCommits.invalidate(scope);
}
