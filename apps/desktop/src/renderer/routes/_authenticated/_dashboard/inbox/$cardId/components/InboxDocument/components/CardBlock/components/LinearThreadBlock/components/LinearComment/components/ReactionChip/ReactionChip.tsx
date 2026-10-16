import { formatList } from "@superset/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import type { LinearReactionView } from "../../../../../../types";
import { slackEmojiChar } from "../../../../../../utils/slackEmoji";

interface ReactionChipProps {
	reaction: LinearReactionView;
	/** Present when the reader can react; a click toggles their own reaction. */
	onToggle?: () => void;
}

/** Linear's reaction chip: the emoji and its count, tinted when the reader is among them. */
export function ReactionChip({ reaction, onToggle }: ReactionChipProps) {
	const mine = reaction.mine !== null;
	const chip = (
		<button
			type="button"
			disabled={!onToggle}
			aria-pressed={mine}
			data-reaction={reaction.emoji}
			onClick={onToggle}
			className={cn(
				"inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs tabular-nums outline-none",
				mine
					? "border-[#5e6ad2]/50 bg-[#5e6ad2]/20 text-foreground"
					: "border-border bg-fill-hover text-muted-foreground",
				onToggle && "hover:border-foreground/30",
			)}
		>
			<span className="text-sm leading-none">
				{slackEmojiChar(reaction.emoji) ?? `:${reaction.emoji}:`}
			</span>
			{reaction.count}
		</button>
	);
	if (reaction.names.length === 0) return chip;
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>{chip}</TooltipTrigger>
			<TooltipContent side="top">{formatList(reaction.names)}</TooltipContent>
		</Tooltip>
	);
}
