import type { PullRequest } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/getPRFlowState";
import type { PRState } from "renderer/screens/main/components/PRIcon";

export function pullRequestLinkState(
	pr: Pick<PullRequest, "isDraft" | "state">,
): PRState {
	if (pr.isDraft) return "draft";
	if (pr.state === "merged" || pr.state === "closed" || pr.state === "queued") {
		return pr.state;
	}
	return "open";
}
