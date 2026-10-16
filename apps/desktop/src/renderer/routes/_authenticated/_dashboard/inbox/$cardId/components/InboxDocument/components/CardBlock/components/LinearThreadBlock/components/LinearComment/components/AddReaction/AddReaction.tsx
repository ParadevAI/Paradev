import { useLingui } from "@lingui/react/macro";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { useState } from "react";
import { LuSmilePlus } from "react-icons/lu";
import { EmojiPicker } from "../../../../../EmojiPicker";

interface AddReactionProps {
	/** Takes the emoji's short name, like `+1`. */
	onPick: (emoji: string) => void;
}

/** The add-reaction icon under a comment; it opens the emoji picker. */
export function AddReaction({ onPick }: AddReactionProps) {
	const { t } = useLingui();
	const [open, setOpen] = useState(false);
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label={t({ message: "Add reaction" })}
					className="flex size-6 items-center justify-center rounded-full text-muted-foreground outline-none hover:bg-fill-hover hover:text-foreground focus-visible:bg-fill-hover"
				>
					<LuSmilePlus className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent side="top" align="start" className="w-auto p-0">
				<EmojiPicker
					onPick={({ reaction }) => {
						onPick(reaction.split("::")[0] ?? reaction);
						setOpen(false);
					}}
				/>
			</PopoverContent>
		</Popover>
	);
}
