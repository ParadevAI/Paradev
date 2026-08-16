import { SparklesIcon } from "lucide-react";
import { useState } from "react";
import { track } from "renderer/lib/analytics";
import { shuffledSamplePrompts } from "./constants";

/** The rows layout stays scannable at 4; the pool is bigger for variety. */
const ROW_COUNT = 4;

interface SamplePromptsProps {
	onSelect: (prompt: string) => void;
}

export function SamplePrompts({ onSelect }: SamplePromptsProps) {
	// Shuffled once per mount so every prompt in the pool gets exposure;
	// re-shuffling per render would reorder rows under the pointer.
	const [shuffledPrompts] = useState(shuffledSamplePrompts);

	return (
		<div className="flex flex-col items-start gap-0.5 px-1 pb-2">
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
