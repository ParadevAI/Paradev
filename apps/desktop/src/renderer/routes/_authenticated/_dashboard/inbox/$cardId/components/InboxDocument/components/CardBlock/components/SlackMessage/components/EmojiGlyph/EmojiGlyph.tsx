import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { slackEmojiChar } from "../../../../utils/slackEmoji";

interface EmojiGlyphProps {
	name: string;
	/** Custom emoji name → image url. */
	emoji: Readonly<Record<string, string>>;
	className?: string;
	/** Off where the glyph sits inside something with its own tooltip. */
	tooltip?: boolean;
}

/** `:name:` as Slack shows it: the workspace image, the unicode glyph, or the shortcode itself, named on hover. */
export function EmojiGlyph({
	name,
	emoji,
	className,
	tooltip = true,
}: EmojiGlyphProps) {
	const custom = emoji[name];
	const glyph = custom ? (
		<img
			src={custom}
			alt={`:${name}:`}
			className={className ?? "inline-block size-[1.25em] align-[-0.25em]"}
		/>
	) : (
		<span className={className}>{slackEmojiChar(name) ?? `:${name}:`}</span>
	);
	if (!tooltip) return glyph;
	return (
		<Tooltip delayDuration={300}>
			<TooltipTrigger asChild>{glyph}</TooltipTrigger>
			<TooltipContent side="top" className="font-semibold">
				:{name}:
			</TooltipContent>
		</Tooltip>
	);
}
