import { Trans } from "@lingui/react/macro";
import type { RendererContext } from "@superset/panes";
import { useMemo } from "react";
import type {
	PaneViewerData,
	PendingCloudChatPaneData,
} from "../../../../types";
import { DraftChat } from "../ChatPane/components/AcpChatPane/components/DraftChat";

export function PendingCloudChatPane({
	ctx,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}) {
	const data = ctx.pane.data as PendingCloudChatPaneData;
	const queued = useMemo(
		() => [
			...(data.launchPrompt
				? [[{ type: "text" as const, text: data.launchPrompt }]]
				: []),
			...(data.queuedPrompts ?? []),
		],
		[data.launchPrompt, data.queuedPrompts],
	);
	return (
		<DraftChat
			draftKey={`chat-v3-draft:${data.draftId}`}
			isActive={ctx.isActive}
			notice={<Trans>Starting the agent…</Trans>}
			onQueue={(content) => {
				const current = ctx.store
					.getState()
					.tabs.flatMap((tab) => Object.values(tab.panes))
					.find((pane) => pane.id === ctx.pane.id)?.data as
					| PendingCloudChatPaneData
					| undefined;
				if (!current) return;
				ctx.actions.updateData({
					...current,
					queuedPrompts: [...(current.queuedPrompts ?? []), content],
				});
			}}
			queued={queued}
			workspaceId={workspaceId}
		/>
	);
}
