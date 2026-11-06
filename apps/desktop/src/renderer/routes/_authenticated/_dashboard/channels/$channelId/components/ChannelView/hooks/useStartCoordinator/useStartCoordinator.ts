import type { UserContent } from "@superset/chat/protocol";
import type { RouterOutputs } from "@superset/trpc";
import { useCallback } from "react";
import { readLastChatAgent } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/utils/lastChatAgent";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import {
	DEFAULT_COORDINATOR_AGENT,
	useChannelCoordinatorStore,
} from "../../../../stores/channelCoordinatorStore";
import { channelBrief } from "../../utils/channelBrief";

type ChannelSummary = RouterOutputs["channel"]["get"];

/**
 * Links a channel to a new coordinating session in one of the reader's
 * workspaces. The session itself is minted when the chat mounts; the brief
 * and the first message wait in the queue until it is ready.
 */
export function useStartCoordinator(
	channelId: string,
	channel: Pick<ChannelSummary, "name"> | undefined,
) {
	const link = useChannelCoordinatorStore((state) => state.link);
	const settings = useChannelCoordinatorStore(
		(state) => state.settingsByChannelId[channelId],
	);
	const { workspaces } = useHostWorkspaces();
	const name = channel?.name ?? "";
	const start = useCallback(
		(workspaceId: string, prompt: string, goal: string | null) => {
			const workspace = workspaces.find((row) => row.id === workspaceId);
			const brief = channelBrief({
				channelName: name,
				goal,
				projectId: workspace?.projectId ?? null,
				instructions: settings?.instructions ?? "",
			});
			const first: UserContent[] = [
				{ type: "text", text: brief, hidden: true },
				{ type: "text", text: prompt },
			];
			link(channelId, {
				workspaceId,
				terminalId: crypto.randomUUID(),
				agentId:
					settings?.agentId ?? readLastChatAgent() ?? DEFAULT_COORDINATOR_AGENT,
				sessionId: null,
				pendingPrompts: [first],
			});
		},
		[channelId, name, link, workspaces, settings],
	);
	return start;
}
