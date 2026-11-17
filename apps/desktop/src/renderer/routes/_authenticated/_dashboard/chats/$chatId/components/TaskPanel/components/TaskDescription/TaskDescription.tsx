import { useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";

interface TaskDescriptionProps {
	value: string;
	onSave: (markdown: string) => void;
}

/** The task's description: read as markdown, and edited as its source on a click. */
export function TaskDescription({ value, onSave }: TaskDescriptionProps) {
	const { t } = useLingui();
	const [draft, setDraft] = useState<string | null>(null);
	if (draft === null) {
		return (
			<button
				type="button"
				onClick={() => setDraft(value)}
				className="block w-full cursor-text rounded-md text-left text-sm [&_p]:my-1"
			>
				{value ? (
					<ChatMarkdown>{value}</ChatMarkdown>
				) : (
					<span className="text-muted-foreground">
						{t({ message: "Add a description…" })}
					</span>
				)}
			</button>
		);
	}
	return (
		<Textarea
			autoFocus
			value={draft}
			onChange={(event) => setDraft(event.target.value)}
			onBlur={() => {
				if (draft !== value) onSave(draft);
				setDraft(null);
			}}
			onKeyDown={(event) => {
				if (event.key === "Escape") setDraft(null);
			}}
			className="min-h-32 text-sm"
		/>
	);
}
