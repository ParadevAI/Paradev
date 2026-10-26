import { useHotkey } from "renderer/hotkeys";
import {
	type OpenPullRequestPane,
	openPullRequestLink,
} from "renderer/lib/github/openPullRequestLink";
import { useCreatePrFormIntent } from "../../state/createPrFormIntent";
import { usePRFlowState } from "../usePRFlowState";
import { resolveOpenPrAction } from "./resolveOpenPrAction";

export function useOpenPrHotkey({
	workspaceId,
	enabled,
	openPullRequestPane,
}: {
	workspaceId: string;
	enabled: boolean;
	openPullRequestPane: OpenPullRequestPane;
}) {
	const { flowState } = usePRFlowState(workspaceId, { enabled });

	useHotkey(
		"OPEN_PR",
		() => {
			const action = resolveOpenPrAction(flowState);
			if (action.kind === "open") {
				openPullRequestLink(action.url, null, openPullRequestPane);
			} else if (action.kind === "create") {
				useCreatePrFormIntent.getState().request(workspaceId);
			}
		},
		{ enabled },
	);
}
