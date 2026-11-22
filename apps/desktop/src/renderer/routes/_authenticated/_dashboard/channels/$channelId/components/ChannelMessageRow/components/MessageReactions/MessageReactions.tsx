import { useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import type { ChannelReaction } from "@superset/shared/channels";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuSmilePlus } from "react-icons/lu";
import type { ChannelPerson } from "../../ChannelMessageRow";
import { EmojiPicker } from "../EmojiPicker";
import { ReactionPill } from "../ReactionPill";

interface MessageReactionsProps {
	reactions: ChannelReaction[];
	currentUserId: string | null;
	peopleById: Map<string, ChannelPerson>;
	/** Absent when the reader cannot react here. */
	onReact?: (emoji: string, reacted: boolean) => void;
}

export function MessageReactions({
	reactions,
	currentUserId,
	peopleById,
	onReact,
}: MessageReactionsProps) {
	const { t } = useLingui();
	const [picking, setPicking] = useState(false);
	if (reactions.length === 0) return null;
	return (
		<div className="mt-1 flex flex-wrap items-center gap-1">
			{reactions.map((reaction) => {
				const mine =
					currentUserId !== null && reaction.actorIds.includes(currentUserId);
				const who = formatList(
					reaction.actorIds.map((id) =>
						id === currentUserId
							? t({ message: "You", context: "reaction tooltip" })
							: (peopleById.get(id)?.name ??
								t({ message: "Someone", context: "reaction tooltip" })),
					),
				);
				return (
					<ReactionPill
						key={reaction.emoji}
						reaction={reaction}
						mine={mine}
						who={who}
						onToggle={onReact && (() => onReact(reaction.emoji, !mine))}
					/>
				);
			})}
			{onReact && (
				<Popover open={picking} onOpenChange={setPicking}>
					<PopoverTrigger asChild>
						<button
							type="button"
							aria-label={t({ message: "Add reaction…" })}
							className="inline-flex h-6 items-center rounded-full border border-transparent bg-fill-hover px-2 text-muted-foreground hover:border-border hover:text-foreground"
						>
							<LuSmilePlus className="size-3.5" />
						</button>
					</PopoverTrigger>
					<PopoverContent side="top" align="start" className="w-auto p-0">
						<EmojiPicker
							onPick={({ reaction }) => {
								onReact(reaction, true);
								setPicking(false);
							}}
						/>
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}
