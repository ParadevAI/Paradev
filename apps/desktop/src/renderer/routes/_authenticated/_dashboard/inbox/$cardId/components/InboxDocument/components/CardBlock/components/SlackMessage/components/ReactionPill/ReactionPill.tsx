import { Trans, useLingui } from "@lingui/react/macro";
import { formatList } from "@superset/i18n/format";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useSlackWorkspace } from "../../../../providers/SlackWorkspaceProvider";
import type { SlackReaction } from "../../types";
import { EmojiGlyph } from "../EmojiGlyph";

interface ReactionPillProps {
	reaction: SlackReaction;
	/** Present when the reader can react; clicking toggles their own reaction. */
	onToggle?: () => void;
}

/** Slack's reaction: emoji and count in a pill, filled when the reader is among them, who reacted on hover. */
export function ReactionPill({ reaction, onToggle }: ReactionPillProps) {
	const { t } = useLingui();
	const { people, emoji } = useSlackWorkspace();
	const names = reaction.users.map((id) =>
		people.get(id)?.isReader
			? onToggle
				? t({ message: "You (click to remove)", context: "reaction tooltip" })
				: t({ message: "You", context: "reaction tooltip" })
			: (people.get(id)?.name ?? id),
	);
	const others = reaction.count - reaction.users.length;
	if (others > 0)
		names.push(
			others === 1
				? t({ message: "1 other", context: "reaction tooltip" })
				: t({ message: `${others} others`, context: "reaction tooltip" }),
		);
	const who = formatList(names);
	const shortcode = `:${reaction.name}:`;

	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>
				<button
					type="button"
					disabled={!onToggle}
					onClick={onToggle}
					className={cn(
						"inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-xs font-medium tabular-nums transition-colors",
						reaction.mine
							? "border-sky-500/70 bg-sky-500/20 text-blue-600 dark:text-sky-300"
							: "border-transparent bg-fill-hover text-muted-foreground",
						onToggle &&
							(reaction.mine
								? "hover:bg-sky-500/30"
								: "hover:border-border hover:bg-fill-selected"),
					)}
				>
					<EmojiGlyph
						name={reaction.name}
						emoji={emoji}
						tooltip={false}
						className="flex size-4 items-center justify-center text-[15px] leading-none"
					/>
					{reaction.count}
				</button>
			</TooltipTrigger>
			<TooltipContent
				side="top"
				className="flex max-w-56 flex-col items-center gap-1 py-2 text-center"
			>
				<span className="flex size-16 items-center justify-center rounded-lg bg-white">
					<EmojiGlyph
						name={reaction.name}
						emoji={emoji}
						tooltip={false}
						className="flex size-11 items-center justify-center text-[40px] leading-none"
					/>
				</span>
				<span className="text-muted-foreground">
					{who ? (
						<Trans>
							<b className="font-semibold text-foreground">{who}</b> reacted
							with {shortcode}
						</Trans>
					) : (
						shortcode
					)}
				</span>
			</TooltipContent>
		</Tooltip>
	);
}
