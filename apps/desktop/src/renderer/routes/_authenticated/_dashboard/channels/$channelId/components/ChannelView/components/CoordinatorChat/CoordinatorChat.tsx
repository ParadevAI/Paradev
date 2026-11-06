import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { AcpChatPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/AcpChatPane";
import { ComposerExtrasProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/ComposerExtrasProvider";
import {
	type TranscriptCards,
	TranscriptCardsProvider,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { WorkspaceProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useChannelSpeakers } from "../../../../hooks/useChannelSpeakers";
import {
	type ChannelCoordinator,
	useChannelCoordinatorStore,
} from "../../../../stores/channelCoordinatorStore";
import { useChannelComposerExtras } from "../../hooks/useChannelComposerExtras";
import {
	channelCardsFromMessage,
	channelCardsFromTool,
	channelWantsBody,
} from "../../utils/channelCards";
import { ChannelCard } from "../ChannelCard";

interface CoordinatorChatProps {
	channelId: string;
	channelName: string;
	coordinator: ChannelCoordinator;
}

/**
 * The coordinator's own chat session, in the middle of the channel: the same
 * chat surface a workspace tab shows, mounted in the coordinating workspace.
 */
export function CoordinatorChat({
	channelId,
	channelName,
	coordinator,
}: CoordinatorChatProps) {
	const { t } = useLingui();
	const composerExtras = useChannelComposerExtras(channelId, channelName);
	const speakers = useChannelSpeakers();
	const { workspaces, isReady } = useHostWorkspaces();
	const setSessionId = useChannelCoordinatorStore(
		(state) => state.setSessionId,
	);
	const setPendingPrompts = useChannelCoordinatorStore(
		(state) => state.setPendingPrompts,
	);
	const unlink = useChannelCoordinatorStore((state) => state.unlink);
	const cards = useMemo<TranscriptCards>(
		() => ({
			findCards: channelCardsFromTool,
			wantsBody: channelWantsBody,
			findMessageCards: channelCardsFromMessage,
			quietTools: true,
			keepOut: (card) => card.kind !== "session" && card.kind !== "report",
			speakers,
			renderCard: (card, className) => (
				<ChannelCard channelId={channelId} card={card} className={className} />
			),
		}),
		[channelId, speakers],
	);
	const workspace = workspaces.find(
		(row) => row.id === coordinator.workspaceId,
	);

	if (!workspace) {
		return (
			<div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center text-[13px] text-muted-foreground">
				{isReady ? (
					<>
						<Trans>The coordinator's workspace is gone.</Trans>
						<button
							type="button"
							onClick={() => unlink(channelId)}
							className="h-7 rounded-md border border-border bg-background px-2.5 text-[12px] font-medium text-foreground transition-colors hover:bg-fill-hover"
						>
							<Trans>Start over</Trans>
						</button>
					</>
				) : (
					<Trans>Opening the coordinator…</Trans>
				)}
			</div>
		);
	}

	const pending = coordinator.pendingPrompts;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<WorkspaceProvider workspace={workspace}>
				<TranscriptCardsProvider value={cards}>
					<ComposerExtrasProvider value={composerExtras}>
						<AcpChatPane
							key={`${coordinator.terminalId}:${coordinator.agentId}`}
							workspaceId={workspace.id}
							terminalId={coordinator.terminalId}
							agent={{ id: coordinator.agentId }}
							isActive
							composerPlaceholder={t({ message: `Message #${channelName}` })}
							sessionId={coordinator.sessionId}
							pendingPrompts={pending}
							onPendingPromptsSent={() => setPendingPrompts(channelId, [])}
							onQueuePrompt={(content) =>
								setPendingPrompts(channelId, [...pending, content])
							}
							onRestoreQueuedPrompts={(prompts) =>
								setPendingPrompts(channelId, [...prompts, ...pending])
							}
							onSessionCreated={(sessionId, handoff) => {
								setSessionId(channelId, sessionId);
								if (handoff) {
									setPendingPrompts(channelId, [
										[{ type: "text", text: handoff }],
										...pending,
									]);
								}
							}}
							onSessionInfo={() => {}}
						/>
					</ComposerExtrasProvider>
				</TranscriptCardsProvider>
			</WorkspaceProvider>
		</div>
	);
}
