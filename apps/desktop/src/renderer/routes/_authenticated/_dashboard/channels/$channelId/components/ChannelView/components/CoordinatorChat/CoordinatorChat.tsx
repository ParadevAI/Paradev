import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { AcpChatPane } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatPane/components/AcpChatPane";
import { ComposerExtrasProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/ComposerExtrasProvider";
import {
	type TranscriptCards,
	TranscriptCardsProvider,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { WorkspaceProvider } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useChannelAgents } from "../../../../hooks/useChannelAgents";
import { useChannelSpeakers } from "../../../../hooks/useChannelSpeakers";
import {
	type ChannelCoordinator,
	useChannelCoordinatorStore,
} from "../../../../stores/channelCoordinatorStore";
import { useChannelPaneStore } from "../../../../stores/channelPaneStore";
import {
	MENTION_HREF_PREFIX,
	remarkMentions,
} from "../../../../utils/remarkMentions";
import { useChannelDevs } from "../../../ChannelPane/hooks/useChannelDevs";
import { MemberMention } from "../../../MemberMention";
import { useChannelComposerExtras } from "../../hooks/useChannelComposerExtras";
import {
	channelCardsFromMessage,
	channelCardsFromTool,
	channelWantsBody,
} from "../../utils/channelCards";
import { combineExchanges } from "../../utils/exchangeCards";
import {
	chipAgentId,
	chipDevId,
	mentionedDevIds,
} from "../../utils/memberChips";
import { ChannelCard } from "../ChannelCard";
import { DevReplies } from "./components/DevReplies";

const AGENT_MENTION = "agent:";
const DEV_MENTION = "dev:";

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
	const devs = useChannelDevs(channelId);
	const { agents } = useChannelAgents(channelName);
	const mentionNames = useMemo(
		() => [
			...agents.map(({ workspace }) => ({
				id: `${AGENT_MENTION}${workspace.id}`,
				name: workspace.name,
			})),
			...devs.map((dev) => ({
				id: `${DEV_MENTION}${dev.actorId}`,
				name: dev.name,
			})),
		],
		[agents, devs],
	);
	const { workspaces, isReady } = useHostWorkspaces();
	const setSessionId = useChannelCoordinatorStore(
		(state) => state.setSessionId,
	);
	const setPendingPrompts = useChannelCoordinatorStore(
		(state) => state.setPendingPrompts,
	);
	const unlink = useChannelCoordinatorStore((state) => state.unlink);
	const pushPage = useChannelPaneStore((state) => state.push);
	const navigate = useNavigate();
	const cards = useMemo<TranscriptCards>(() => {
		const openAgent = (id: string) =>
			pushPage(channelId, { kind: "agent", id });
		const openDev = (devId: string) =>
			void navigate({ to: "/devs/$devId", params: { devId } });
		return {
			findCards: channelCardsFromTool,
			wantsBody: channelWantsBody,
			findMessageCards: channelCardsFromMessage,
			quietTools: true,
			combineCards: combineExchanges,
			keepOut: (card) =>
				card.kind !== "session" &&
				card.kind !== "report" &&
				card.kind !== "sent",
			speakers,
			renderCard: (card, className) => (
				<ChannelCard
					channelId={channelId}
					self={speakers.agent}
					card={card}
					className={className}
				/>
			),
			afterUserMessage: (message, text) => {
				const elements =
					message.content.find((part) => part.type === "text")?.elements ?? [];
				const devIds = mentionedDevIds(text, elements, devs);
				if (devIds.length === 0) return null;
				return (
					<DevReplies
						channelId={channelId}
						text={text}
						postedAt={message.startedAtMs}
						devIds={devIds}
					/>
				);
			},
			renderChip: (chip, rendered) => {
				const agentId = chipAgentId(chip);
				const devId = chipDevId(chip);
				if (!agentId && !devId) return null;
				return (
					<button
						type="button"
						onClick={() => {
							if (agentId) openAgent(agentId);
							else if (devId) openDev(devId);
						}}
					>
						{rendered}
					</button>
				);
			},
			markdown: {
				remarkPlugins: [[remarkMentions, { people: mentionNames }]],
				renderLink: (href, children) => {
					if (!href.startsWith(MENTION_HREF_PREFIX)) return null;
					const id = href.slice(MENTION_HREF_PREFIX.length);
					const open = id.startsWith(AGENT_MENTION)
						? () => openAgent(id.slice(AGENT_MENTION.length))
						: id.startsWith(DEV_MENTION)
							? () => openDev(id.slice(DEV_MENTION.length))
							: null;
					return (
						open && <MemberMention onClick={open}>{children}</MemberMention>
					);
				},
			},
		};
	}, [channelId, speakers, devs, mentionNames, pushPage, navigate]);
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
