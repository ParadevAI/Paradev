import type { RendererContext } from "@superset/panes";
import { useMemo } from "react";
import type {
	PaneViewerData,
	PendingCloudLaunchPaneData,
} from "../../../../../../types";
import { chatDraftKey } from "../../../../utils/chatDraftKey";
import { DraftChat } from "../../../ChatPane/components/AcpChatPane/components/DraftChat";

export function PendingCloudChat({
	ctx,
	workspaceId,
}: {
	ctx: RendererContext<PaneViewerData>;
	workspaceId: string;
}) {
	const data = ctx.pane.data as PendingCloudLaunchPaneData;
	const launched = useMemo(
		() =>
			data.launchPrompt
				? [{ type: "text" as const, text: data.launchPrompt }]
				: undefined,
		[data.launchPrompt],
	);
	const queued = useMemo(() => data.queuedPrompts ?? [], [data.queuedPrompts]);
	return (
		<DraftChat
			draftKey={chatDraftKey(data.draftId)}
			isActive={ctx.isActive}
			launched={launched}
			onQueue={(content) => {
				const current = ctx.store
					.getState()
					.tabs.flatMap((tab) => Object.values(tab.panes))
					.find((pane) => pane.id === ctx.pane.id)?.data as
					| PendingCloudLaunchPaneData
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
