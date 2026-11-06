import { openPullRequestInBrowser } from "renderer/lib/github/openPullRequestInBrowser";
import type {
	TranscriptCardRef,
	TranscriptSpeaker,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { useChannelCoordinatorStore } from "../../../../stores/channelCoordinatorStore";
import { useChannelPaneStore } from "../../../../stores/channelPaneStore";
import { DecisionRow } from "../../../DecisionRow";
import { AgentCard } from "./components/AgentCard";
import { ExchangeCard } from "./components/ExchangeCard";
import { PullRequestCard } from "./components/PullRequestCard";
import { ReportCard } from "./components/ReportCard";
import { SessionCard } from "./components/SessionCard";

interface ChannelCardProps {
	channelId: string;
	card: TranscriptCardRef;
	className: string;
	/** Where a chosen option goes; the coordinator's queue unless the chat is another agent's. */
	onAnswer?: (text: string) => void;
	/** The agent whose chat this is, for an exchange it had with another agent. */
	self: TranscriptSpeaker;
}

/**
 * One card in a channel's conversation: a workspace the agent made, a chat
 * it started, what it and another agent said to each other, a pull request or
 * report it relayed, or a choice it offers. Every one but the choice opens the
 * agent behind it in the pane.
 */
export function ChannelCard({
	channelId,
	card,
	className,
	onAnswer,
	self,
}: ChannelCardProps) {
	const pushPage = useChannelPaneStore((state) => state.push);
	const openAgent = (id: string) => pushPage(channelId, { kind: "agent", id });
	const answer =
		onAnswer ??
		((text: string) => {
			const store = useChannelCoordinatorStore.getState();
			const queued = store.byChannelId[channelId]?.pendingPrompts ?? [];
			store.setPendingPrompts(channelId, [...queued, [{ type: "text", text }]]);
		});
	switch (card.kind) {
		case "workspace":
			return (
				<AgentCard
					workspaceId={card.workspaceId}
					name={card.name}
					branch={card.branch}
					className={className}
					onOpen={openAgent}
				/>
			);
		case "session":
			return (
				<SessionCard
					workspaceId={card.workspaceId}
					agent={card.agent}
					prompt={card.prompt}
					className={className}
					onOpen={openAgent}
				/>
			);
		case "pull_request":
			return (
				<PullRequestCard
					url={card.url}
					repoFullName={card.repoFullName}
					number={card.number}
					className={className}
					onOpen={(workspaceId) =>
						workspaceId
							? openAgent(workspaceId)
							: openPullRequestInBrowser(card.url)
					}
				/>
			);
		case "report":
			return (
				<ReportCard
					workspaceId={card.workspaceId}
					sessionId={card.sessionId}
					text={card.text}
					className={className}
					onOpen={openAgent}
				/>
			);
		case "exchange":
			return (
				<ExchangeCard
					exchange={card}
					self={self}
					className={className}
					onOpen={openAgent}
				/>
			);
		case "sent":
			return null;
		case "decision":
			return (
				<DecisionRow
					options={card.options}
					details={card.details}
					className={className}
					onAnswer={answer}
				/>
			);
	}
}
