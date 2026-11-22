import type { PRState } from "renderer/screens/main/components/PRIcon";

export function pullRequestDisplayState(pullRequest: {
	state: PRState;
	isDraft: boolean;
}): PRState {
	return pullRequest.isDraft && pullRequest.state === "open"
		? "draft"
		: pullRequest.state;
}

export const showsChecks = (state: PRState) =>
	state === "open" || state === "draft" || state === "queued";
