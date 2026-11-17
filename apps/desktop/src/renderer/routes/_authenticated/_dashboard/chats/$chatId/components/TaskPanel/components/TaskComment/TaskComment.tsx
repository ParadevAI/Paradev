import { useLingui } from "@lingui/react/macro";
import { Textarea } from "@superset/ui/textarea";
import { useState } from "react";
import { LuArrowUp } from "react-icons/lu";

interface TaskCommentProps {
	/** The task's Dev, when it has one: a comment then reads as telling it more. */
	devName: string | null;
	/** Resolves to whether the comment was added; the words stay otherwise. */
	onComment: (text: string) => Promise<boolean>;
}

/** Where a comment on the task is written. Enter sends it. */
export function TaskComment({ devName, onComment }: TaskCommentProps) {
	const { t } = useLingui();
	const [text, setText] = useState("");
	const [isSending, setIsSending] = useState(false);
	const send = async () => {
		const words = text.trim();
		if (!words || isSending) return;
		setIsSending(true);
		if (await onComment(words)) setText("");
		setIsSending(false);
	};
	return (
		<div className="flex items-end gap-2 rounded-xl border border-border bg-background px-3 py-2">
			<Textarea
				value={text}
				rows={1}
				onChange={(event) => setText(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter" && !event.shiftKey) {
						event.preventDefault();
						void send();
					}
				}}
				placeholder={
					devName
						? t({ message: `Comment, or tell ${devName} more…` })
						: t({ message: "Add a comment…" })
				}
				className="min-h-6 flex-1 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
			/>
			<button
				type="button"
				aria-label={t({ message: "Send comment" })}
				disabled={!text.trim() || isSending}
				onClick={() => void send()}
				className="flex size-6 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-30"
			>
				<LuArrowUp className="size-3.5" />
			</button>
		</div>
	);
}
