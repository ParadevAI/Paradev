import { Trans, useLingui } from "@lingui/react/macro";
import { presetForAcpHarness } from "@superset/chat/core";
import type { UserContent } from "@superset/chat/protocol";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AcpChatPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/AcpChatPane";
import {
	type TranscriptCards,
	TranscriptCardsProvider,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { WorkspaceProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { markWorkspaceSeen } from "renderer/routes/_authenticated/_dashboard/v2-workspaces/utils/markWorkspaceSeen";
import { useAgentSession } from "../../../../hooks/useAgentSession";
import { useAgentWorkspace } from "../../../../hooks/useAgentWorkspace";
import { deriveChannelAgentState } from "../../../../hooks/useChannelAgents";
import { useChannelSpeakers } from "../../../../hooks/useChannelSpeakers";
import { ChannelCard } from "../../../ChannelView/components/ChannelCard";
import {
	channelCardsFromMessage,
	channelCardsFromTool,
	channelWantsBody,
} from "../../../ChannelView/utils/channelCards";
import { WorkingNote } from "./components/WorkingNote";

interface AgentPageProps {
	channelId: string;
	workspaceId: string;
}

/**
 * One agent of the channel: its chat as a log, right here, so you read what
 * it did and reply without leaving the channel. The work folds behind each
 * reply; its state and controls sit in the pane's header.
 */
export function AgentPage({ channelId, workspaceId }: AgentPageProps) {
	const { t } = useLingui();
	const { workspace, hostRow, hostUrl, isReady } =
		useAgentWorkspace(workspaceId);
	const session = useAgentSession(workspaceId, hostUrl);
	const [pendingPrompts, setPendingPrompts] = useState<UserContent[][]>([]);
	const [resumedAs, setResumedAs] = useState<{
		from: string;
		sessionId: string;
	} | null>(null);
	const seenMarks = workspace?.seenMarks;
	useEffect(() => {
		if (seenMarks) markWorkspaceSeen({ id: workspaceId, seenMarks });
	}, [workspaceId, seenMarks]);
	const speakers = useChannelSpeakers(
		workspace?.name ?? t({ message: "Agent" }),
	);
	const answer = useCallback(
		(text: string) =>
			setPendingPrompts((queued) => [...queued, [{ type: "text", text }]]),
		[],
	);
	const cards = useMemo<TranscriptCards>(
		() => ({
			findCards: channelCardsFromTool,
			wantsBody: channelWantsBody,
			findMessageCards: channelCardsFromMessage,
			quietTools: true,
			keepOut: (card) => card.kind !== "session" && card.kind !== "report",
			speakers,
			renderCard: (card, className) => (
				<ChannelCard
					channelId={channelId}
					card={card}
					className={className}
					onAnswer={answer}
				/>
			),
		}),
		[channelId, answer, speakers],
	);

	if (!workspace || !hostRow) {
		return (
			<p className="px-5 pt-5 text-[13px] text-muted-foreground">
				{isReady ? (
					<Trans>This workspace is gone.</Trans>
				) : (
					<Trans>Loading…</Trans>
				)}
			</p>
		);
	}
	const chat = session.data;
	if (!chat) {
		return (
			<p className="px-5 py-5 text-[13px] leading-[18px] text-muted-foreground">
				{session.isPending ? (
					<Trans>Looking for its chat…</Trans>
				) : (
					<Trans>
						No chat session in this workspace yet. Open the workspace to start
						one.
					</Trans>
				)}
			</p>
		);
	}
	const working = deriveChannelAgentState(workspace) === "working";
	const sessionId =
		resumedAs?.from === chat.sessionId ? resumedAs.sessionId : chat.sessionId;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{working && (
				<WorkingNote
					workspaceId={workspaceId}
					hostUrl={hostUrl}
					sessionId={sessionId}
				/>
			)}
			<WorkspaceProvider workspace={hostRow}>
				<TranscriptCardsProvider value={cards}>
					<AcpChatPane
						key={chat.sessionId}
						workspaceId={workspaceId}
						terminalId={chat.terminalId ?? chat.sessionId}
						agent={{
							id: presetForAcpHarness(chat.harness) ?? "claude",
							sessionId: chat.harnessSessionId ?? undefined,
						}}
						isActive
						composerPlaceholder={t({ message: `Reply to ${workspace.name}…` })}
						composerCompact
						wakeOnReply
						sessionId={sessionId}
						pendingPrompts={pendingPrompts}
						onPendingPromptsSent={() => setPendingPrompts([])}
						onQueuePrompt={(content) =>
							setPendingPrompts((queued) => [...queued, content])
						}
						onRestoreQueuedPrompts={(prompts) =>
							setPendingPrompts((queued) => [...prompts, ...queued])
						}
						onSessionCreated={(created) =>
							setResumedAs({ from: chat.sessionId, sessionId: created })
						}
						onSessionInfo={() => {}}
					/>
				</TranscriptCardsProvider>
			</WorkspaceProvider>
		</div>
	);
}
