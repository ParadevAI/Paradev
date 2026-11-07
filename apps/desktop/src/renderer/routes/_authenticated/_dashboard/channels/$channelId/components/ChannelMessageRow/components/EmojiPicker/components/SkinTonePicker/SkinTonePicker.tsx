import { Trans, useLingui } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { SKIN_TONES, withSkinTone } from "../../../../../../utils/slackEmoji";

const HAND = "✋";

interface SkinTonePickerProps {
	tone: number;
	onChange: (tone: number) => void;
}

/** Slack's "Skin Tone" control: the current hand, opening a row of all six. */
export function SkinTonePicker({ tone, onChange }: SkinTonePickerProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Choose your default skin tone" })}
					className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-fill-hover hover:text-foreground"
				>
					<span className="text-xl leading-none">
						{withSkinTone(HAND, tone)}
					</span>
					<Trans>Skin Tone</Trans>
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="end" className="w-auto p-2">
				<div className="mb-1 text-xs text-muted-foreground">
					<Trans>Choose your default skin tone</Trans>
				</div>
				<div className="flex gap-0.5">
					{SKIN_TONES.map((_, index) => (
						<button
							// biome-ignore lint/suspicious/noArrayIndexKey: the six tones never reorder
							key={index}
							type="button"
							aria-pressed={index === tone}
							onClick={() => {
								onChange(index);
								setOpen(false);
							}}
							className={cn(
								"flex size-8 items-center justify-center rounded-md text-xl hover:bg-fill-hover",
								index === tone && "bg-fill-selected",
							)}
						>
							{withSkinTone(HAND, index)}
						</button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}
