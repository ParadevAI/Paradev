import { Trans } from "@lingui/react/macro";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuArrowRight } from "react-icons/lu";
import type { TranscriptSpeaker } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/ChatSession/providers/TranscriptCardsProvider";
import { useAgentLastMessage } from "../../../../../../../../hooks/useAgentSession";
import { useAgentWorkspace } from "../../../../../../../../hooks/useAgentWorkspace";

const LONG_CHARS = 480;

interface ExchangeMessageProps {
	from: TranscriptSpeaker;
	to: TranscriptSpeaker;
	text: string;
	/** Set when the text was cut from the output: the agent's chat it can be read from. */
	live: { workspaceId: string; sessionId: string } | null;
	onOpenRecipient?: () => void;
	onOpenSender?: () => void;
}

/** One message in an exchange between two agents: who to whom, then what was said. */
export function ExchangeMessage({
	from,
	to,
	text,
	live,
	onOpenRecipient,
	onOpenSender,
}: ExchangeMessageProps) {
	const { hostUrl } = useAgentWorkspace(live?.workspaceId ?? "");
	const fetched = useAgentLastMessage(
		live ? hostUrl : null,
		live?.workspaceId ?? "",
		live?.sessionId ?? null,
	);
	const said = text || fetched.data?.text || "";
	const [expanded, setExpanded] = useState(false);
	const long = said.length > LONG_CHARS;
	const name = (speaker: TranscriptSpeaker, onOpen?: () => void) =>
		onOpen ? (
			<button
				type="button"
				onClick={onOpen}
				className="font-medium text-foreground underline decoration-muted-foreground/40 decoration-dotted underline-offset-2 hover:decoration-foreground"
			>
				{speaker.name}
			</button>
		) : (
			<span className="font-medium text-foreground">{speaker.name}</span>
		);
	return (
		<div className="flex gap-2.5">
			<span className="mt-0.5 shrink-0">{from.avatar}</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
					{name(from, onOpenSender)}
					<LuArrowRight className="size-3 shrink-0" />
					{name(to, onOpenRecipient)}
				</span>
				{said ? (
					<div
						className={cn(
							"relative text-[13px] leading-[1.55] text-foreground/90",
							long && !expanded && "max-h-40 overflow-hidden",
						)}
					>
						<ChatMarkdown complete>{said}</ChatMarkdown>
						{long && !expanded && (
							<span className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-muted to-transparent" />
						)}
					</div>
				) : (
					<span className="text-[13px] text-muted-foreground">
						<Trans>No answer yet</Trans>
					</span>
				)}
				{long && (
					<button
						type="button"
						onClick={() => setExpanded((current) => !current)}
						className="self-start text-[12px] font-medium text-muted-foreground hover:text-foreground"
					>
						{expanded ? <Trans>Show less</Trans> : <Trans>Show more</Trans>}
					</button>
				)}
			</div>
		</div>
	);
}
