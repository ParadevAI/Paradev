import { Trans } from "@lingui/react/macro";
import { formatRelativeTime } from "@superset/i18n/format";
import { cn } from "@superset/ui/utils";
import type { LinearCommentView } from "../../../../types";
import { LinearAvatar } from "../../../LinearAvatar";
import { LinearMarkdown } from "../../../LinearMarkdown";
import { AddReaction } from "./components/AddReaction";
import { ReactionChip } from "./components/ReactionChip";

interface LinearCommentProps {
	comment: LinearCommentView;
	handles: readonly string[];
	/** A reply: its body lines up with the name. */
	reply?: boolean;
	/** Present when the reader can react. */
	onReact?: (emoji: string, on: boolean) => void;
}

/** One comment of a Linear thread: who, when, the body and its reactions. */
export function LinearComment({
	comment,
	handles,
	reply,
	onReact,
}: LinearCommentProps) {
	const author = comment.author;
	return (
		<article data-comment={comment.id} className="flex flex-col gap-1.5">
			<header className="flex items-center gap-2 text-[13px]">
				{author && <LinearAvatar person={author} />}
				<span className="font-medium text-foreground">
					{author?.name ?? <Trans>Unknown</Trans>}
				</span>
				<time dateTime={comment.createdAt} className="text-muted-foreground">
					{formatRelativeTime(Date.parse(comment.createdAt))}
				</time>
				{comment.edited && (
					<span className="text-muted-foreground">
						<Trans>(edited)</Trans>
					</span>
				)}
			</header>
			<div className={cn("flex flex-col gap-2", reply && "pl-7")}>
				<LinearMarkdown text={comment.body} handles={handles} />
				{(comment.reactions.length > 0 || onReact) && (
					<div className="flex flex-wrap items-center gap-1.5">
						{comment.reactions.map((reaction) => (
							<ReactionChip
								key={reaction.emoji}
								reaction={reaction}
								onToggle={
									onReact &&
									(() => onReact(reaction.emoji, reaction.mine === null))
								}
							/>
						))}
						{onReact && (
							<AddReaction
								onPick={(emoji) =>
									onReact(
										emoji,
										!comment.reactions.some(
											(reaction) =>
												reaction.emoji === emoji && reaction.mine !== null,
										),
									)
								}
							/>
						)}
					</div>
				)}
			</div>
		</article>
	);
}
