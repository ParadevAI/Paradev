import { Trans } from "@lingui/react/macro";
import type { ChannelReaction } from "@superset/shared/channels";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { ReactionEmoji } from "../ReactionEmoji";

interface ReactionPillProps {
	reaction: ChannelReaction;
	mine: boolean;
	/** Who reacted, already joined for display. */
	who: string;
	onToggle?: () => void;
}

export function ReactionPill({
	reaction,
	mine,
	who,
	onToggle,
}: ReactionPillProps) {
	const shortcode = `:${reaction.emoji}:`;
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					disabled={!onToggle}
					aria-pressed={mine}
					onClick={onToggle}
					className={cn(
						"inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium tabular-nums transition-colors",
						mine
							? "border-border bg-fill-selected text-foreground"
							: "border-transparent bg-fill-hover text-muted-foreground",
						onToggle && "hover:border-border hover:text-foreground",
					)}
				>
					<ReactionEmoji
						name={reaction.emoji}
						className="flex size-4 items-center justify-center text-[15px] leading-none"
					/>
					{reaction.actorIds.length}
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="flex max-w-56 flex-col items-center gap-1 py-2 text-center"
			>
				<ReactionEmoji
					name={reaction.emoji}
					className="flex size-12 items-center justify-center text-[36px] leading-none"
				/>
				<span className="text-muted-foreground">
					<Trans>
						<b className="font-semibold text-foreground">{who}</b> reacted with{" "}
						{shortcode}
					</Trans>
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
