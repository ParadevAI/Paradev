import type {
	PRFlowState,
	PullRequest,
} from "../../../../utils/getPRFlowState";

export function menuCurrentPullRequest(
	flowState: PRFlowState,
	isMultiRepo: boolean,
): PullRequest | null {
	if (isMultiRepo) return null;
	return flowState.kind === "pr-exists" ||
		flowState.kind === "busy" ||
		flowState.kind === "error"
		? flowState.pr
		: null;
}
