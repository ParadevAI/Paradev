import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { useRunAfterMenuClose } from "@superset/ui/hooks/use-run-after-menu-close";
import { Popover, PopoverContent, PopoverTrigger } from "@superset/ui/popover";
import { Textarea } from "@superset/ui/textarea";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

export function SelectionComment({
	children,
	enabled,
	onAddToPrompt,
}: {
	children: ReactNode;
	enabled: boolean;
	onAddToPrompt: (prompt: string) => void;
}) {
	const { t } = useLingui();
	const rootRef = useRef<HTMLDivElement>(null);
	const submitted = useRef(false);
	const { runAfterClose, onCloseAutoFocus } = useRunAfterMenuClose();
	const commentId = useId();
	const [selection, setSelection] = useState<{
		text: string;
		left: number;
		top: number;
	} | null>(null);
	const [open, setOpen] = useState(false);
	const [comment, setComment] = useState("");

	useEffect(() => {
		if (!enabled || open) return;
		const capture = () => {
			const selected = window.getSelection();
			const root = rootRef.current;
			const text = selected?.toString().trim();
			if (!root || !selected?.rangeCount || !text) {
				setSelection(null);
				return;
			}
			const range = selected.getRangeAt(0);
			const start = range.startContainer;
			const element = start instanceof Element ? start : start.parentElement;
			const response = element?.closest("[data-chat-response]");
			if (
				!response ||
				!root.contains(response) ||
				!response.contains(range.endContainer)
			) {
				setSelection(null);
				return;
			}
			const rect = range.getBoundingClientRect();
			const bounds = root.getBoundingClientRect();
			setSelection({
				text,
				left: Math.max(
					0,
					Math.min(rect.left - bounds.left, bounds.width - 128),
				),
				top: Math.max(
					0,
					Math.min(rect.bottom - bounds.top, bounds.height - 32),
				),
			});
		};
		document.addEventListener("selectionchange", capture);
		return () => document.removeEventListener("selectionchange", capture);
	}, [enabled, open]);

	return (
		<div
			ref={rootRef}
			className="@container relative flex min-h-0 flex-1"
			onScrollCapture={() => {
				if (!open) setSelection(null);
			}}
		>
			{children}
			{enabled && selection && (
				<Popover open={open} onOpenChange={setOpen}>
					<PopoverTrigger asChild>
						<Button
							className="absolute z-50 shadow-md"
							style={{ left: selection.left, top: selection.top }}
							size="sm"
							variant="outline"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => setComment("")}
						>
							<Trans>Add comment</Trans>
						</Button>
					</PopoverTrigger>
					<PopoverContent
						align="start"
						className="w-80 space-y-3"
						onCloseAutoFocus={(event) => {
							// Submission moves focus to the prompt instead of back to the selection.
							if (!submitted.current) return;
							submitted.current = false;
							onCloseAutoFocus(event);
						}}
					>
						<blockquote className="max-h-32 overflow-auto whitespace-pre-wrap border-l-2 pl-3 text-muted-foreground text-sm">
							{selection.text}
						</blockquote>
						<form
							className="space-y-3"
							onSubmit={(event) => {
								event.preventDefault();
								event.stopPropagation();
								if (!comment.trim()) return;
								submitted.current = true;
								const prompt = `${selection.text
									.split("\n")
									.map((line) => `> ${line}`)
									.join("\n")}\n\n${comment.trim()}\n\n`;
								runAfterClose(() => {
									onAddToPrompt(prompt);
									setSelection(null);
								});
								setOpen(false);
							}}
						>
							<label htmlFor={commentId} className="sr-only">
								<Trans>Comment</Trans>
							</label>
							<Textarea
								id={commentId}
								placeholder={t({ message: "Comment" })}
								value={comment}
								onChange={(event) => setComment(event.target.value)}
							/>
							<div className="flex justify-end gap-2">
								<Button
									type="button"
									variant="ghost"
									size="sm"
									onClick={() => setOpen(false)}
								>
									<Trans>Cancel</Trans>
								</Button>
								<Button type="submit" size="sm" disabled={!comment.trim()}>
									<Trans>Add to prompt</Trans>
								</Button>
							</div>
						</form>
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}
