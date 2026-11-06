import type { AgentMessage } from "@superset/chat/protocol";
import { isImageAttachment } from "@superset/chat/protocol";
import type { ChatForkTarget } from "../../../../types";
import { MarkdownView } from "../../../MarkdownView";
import { AttachmentRail } from "../AttachmentRail";
import { ReplyFooter } from "../ReplyFooter";
import { useBlockFading } from "./hooks/useBlockFading";
import { usePacedText } from "./hooks/usePacedText";

export function AgentMessageRow({
	canForkToWorktree = true,
	lastReply,
	item,
	onFork,
	pagesShownEarlier,
	text,
}: {
	item: AgentMessage;
	text: string;
	/** Absent when this agent cannot branch its own session. */
	onFork?: ((target: ChatForkTarget) => void) | undefined;
	/** False when there is no project to cut a worktree from. */
	canForkToWorktree?: boolean;
	lastReply: boolean;
	/** Slugs of the pages an earlier message of the turn already shows a card for. */
	pagesShownEarlier?: string | undefined;
}) {
	const streaming = item.completedAtMs === undefined;
	const paced = usePacedText(text, streaming);
	const fading = useBlockFading(streaming || paced.revealing);

	const images = (item.attachments ?? [])
		.filter(isImageAttachment)
		.map((image) => ({ owner: item.id, image }));

	return (
		// Actions stay out of the way until the message is pointed at, and stay
		// reachable by keyboard regardless.
		<div className="group/message flex flex-col gap-1">
			<MarkdownView
				className="text-foreground"
				fading={fading}
				final={!streaming && !paced.revealing}
				findItemId={item.id}
				pageCards
				pagesShownEarlier={pagesShownEarlier}
				text={paced.text}
			/>
			{images.length > 0 && <AttachmentRail className="mt-1" images={images} />}
			{lastReply && !streaming && (
				<ReplyFooter
					canForkToWorktree={canForkToWorktree}
					className="group-hover/message:opacity-100"
					item={item}
					onFork={onFork}
					text={text}
				/>
			)}
		</div>
	);
}
