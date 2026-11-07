import { cn } from "@superset/ui/utils";
import type { EmojiItem } from "@tiptap/extension-emoji";
import {
	supportsSkinTone,
	withSkinTone,
} from "../../../../../../utils/slackEmoji";

interface EmojiGlyphProps {
	item: EmojiItem;
	tone: number;
	className?: string;
}

export function EmojiGlyph({ item, tone, className }: EmojiGlyphProps) {
	if (item.emoji)
		return (
			<span className={cn("leading-none", className)}>
				{supportsSkinTone(item.emoji)
					? withSkinTone(item.emoji, tone)
					: item.emoji}
			</span>
		);
	return item.fallbackImage ? (
		<img
			src={item.fallbackImage}
			alt=""
			className={cn("size-[1em] object-contain", className)}
		/>
	) : null;
}
