import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuChevronDown } from "react-icons/lu";
import type {
	TranscriptCardRef,
	TranscriptSpeaker,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { useAgentWorkspace } from "../../../../../../hooks/useAgentWorkspace";
import { SpeakerMark } from "../../../../../SpeakerMark";
import { ExchangeMessage } from "./components/ExchangeMessage";

type Exchange = Extract<TranscriptCardRef, { kind: "exchange" }>;

interface ExchangeCardProps {
	exchange: Exchange;
	/** The agent whose chat this is: the coordinator, or the agent the pane shows. */
	self: TranscriptSpeaker;
	className?: string;
	onOpen: (workspaceId: string) => void;
}

/**
 * What two agents said to each other in one turn, as one conversation: a
 * title, who took part and how much was said, then each message from one to
 * the other. Folds to its header.
 */
export function ExchangeCard({
	exchange,
	self,
	className,
	onOpen,
}: ExchangeCardProps) {
	const { t } = useLingui();
	const { workspace } = useAgentWorkspace(exchange.workspaceId);
	const peerName = workspace?.name ?? t({ message: "an agent" });
	const peer: TranscriptSpeaker = {
		name: peerName,
		avatar: <SpeakerMark name={peerName} />,
	};
	const [open, setOpen] = useState(true);
	const count = exchange.messages.length;
	const openPeer = () => onOpen(exchange.workspaceId);
	return (
		<div
			className={cn(
				"w-full overflow-hidden rounded-[10px] border border-border bg-muted/40",
				className,
			)}
		>
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				aria-expanded={open}
				className={cn(
					"flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-fill-hover",
					open && "border-b border-border",
				)}
			>
				<span className="flex shrink-0 items-center">
					{self.avatar}
					<span className="-ml-2 rounded-[9px] ring-2 ring-muted">
						{peer.avatar}
					</span>
				</span>
				<span className="min-w-0 flex-1 truncate text-[13px] font-medium">
					{exchange.title || peerName}
				</span>
				<span className="shrink-0 truncate text-[12px] text-muted-foreground">
					{t({ message: `${self.name} and ${peerName}` })} ·{" "}
					{t({
						message: plural(count, {
							one: "# message",
							other: "# messages",
						}),
					})}
				</span>
				<LuChevronDown
					className={cn(
						"size-3.5 shrink-0 text-muted-foreground transition-transform",
						!open && "-rotate-90",
					)}
				/>
			</button>
			{open && (
				<div className="flex flex-col gap-4 px-3 py-3">
					{exchange.messages.map((message, index) => {
						const fromSelf = message.from === "self";
						return (
							<ExchangeMessage
								// biome-ignore lint/suspicious/noArrayIndexKey: messages have no identity beyond their order in the turn
								key={index}
								from={fromSelf ? self : peer}
								to={fromSelf ? peer : self}
								text={message.text}
								live={
									!fromSelf && !message.text && message.sessionId
										? {
												workspaceId: exchange.workspaceId,
												sessionId: message.sessionId,
											}
										: null
								}
								{...(fromSelf
									? { onOpenRecipient: openPeer }
									: { onOpenSender: openPeer })}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
}
