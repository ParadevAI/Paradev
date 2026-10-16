import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import type { EmojiItem } from "@tiptap/extension-emoji";
import { slackNames } from "../../../../utils/slackEmoji";
import { EmojiGlyph } from "../EmojiGlyph";
import { SkinTonePicker } from "../SkinTonePicker";

interface PickerFooterProps {
	preview: EmojiItem | null;
	tone: number;
	onToneChange: (tone: number) => void;
	addEmojiUrl: string | null;
}

/** The hovered emoji large with its name, else Add Emoji; the skin tone control always. */
export function PickerFooter({
	preview,
	tone,
	onToneChange,
	addEmojiUrl,
}: PickerFooterProps) {
	const name = preview ? (slackNames(preview)[0] ?? preview.name) : null;
	return (
		<div className="flex h-[60px] shrink-0 items-center justify-between gap-2 border-t border-border px-3">
			{preview && name ? (
				<div className="flex min-w-0 items-center gap-2.5">
					<EmojiGlyph item={preview} tone={tone} className="text-[32px]" />
					<div className="min-w-0">
						<div className="truncate text-sm font-semibold text-foreground">
							{name.replace(/_/g, " ")}
						</div>
						<div className="truncate text-xs text-muted-foreground">
							:{name}:
						</div>
					</div>
				</div>
			) : addEmojiUrl ? (
				<Button variant="outline" size="sm" asChild>
					<a href={addEmojiUrl} target="_blank" rel="noreferrer">
						<Trans>Add Emoji</Trans>
					</a>
				</Button>
			) : (
				<span />
			)}
			<SkinTonePicker tone={tone} onChange={onToneChange} />
		</div>
	);
}
