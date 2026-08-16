import { SparklesIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { track } from "renderer/lib/analytics";
import { shuffledSamplePrompts } from "./constants";

/** The rows layout stays scannable at 4; the pool is bigger for variety. */
const ROW_COUNT = 4;

interface SamplePromptsProps {
	onSelect: (prompt: string) => void;
	onDismiss: () => void;
}

export function SamplePrompts({ onSelect, onDismiss }: SamplePromptsProps) {
	// Shuffled once per mount so every prompt in the pool gets exposure;
	// re-shuffling per render would reorder rows under the pointer.
	const [shuffledPrompts] = useState(shuffledSamplePrompts);

	return (
		<div className="group relative flex flex-col items-start gap-0.5 px-1 pb-2">
			<button
				type="button"
				aria-label="Dismiss suggestions"
				onClick={onDismiss}
				className="absolute -top-2 right-0 z-10 flex size-5 cursor-pointer items-center justify-center rounded-full border-[0.5px] border-border bg-popover text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
			>
				<XIcon className="size-3" />
			</button>
			{shuffledPrompts.slice(0, ROW_COUNT).map((sample) => (
				<button
					key={sample.id}
					type="button"
					className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
					onClick={() => {
						track("new_workspace_sample_prompt_clicked", {
							prompt_id: sample.id,
							layout: "rows",
						});
						onSelect(sample.prompt);
					}}
				>
					<SparklesIcon className="size-3.5 shrink-0" />
					{sample.label}
				</button>
			))}
		</div>
	);
}
