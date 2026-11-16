import { Trans, useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LuArrowUp, LuPencil, LuReply, LuX } from "react-icons/lu";

const MAX_HEIGHT_PX = 240;

interface ChatComposerProps {
	placeholder: string;
	/** The message the next send answers. */
	replyingTo: { name: string; text: string } | null;
	/** The viewer's own message whose words the composer holds. */
	editing: { text: string } | null;
	onCancel: () => void;
	onSend: (text: string) => void;
	/** Up in an empty composer: edit the last message you sent. */
	onEditLast: () => void;
}

/** The composer as one card: the text, and send only once there is something to send. */
export function ChatComposer({
	placeholder,
	replyingTo,
	editing,
	onCancel,
	onSend,
	onEditLast,
}: ChatComposerProps) {
	const { t } = useLingui();
	const [text, setText] = useState("");
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const editingText = editing?.text;
	useEffect(() => {
		if (editingText !== undefined) setText(editingText);
		inputRef.current?.focus();
	}, [editingText]);
	const hasReply = replyingTo !== null;
	useEffect(() => {
		if (hasReply) inputRef.current?.focus();
	}, [hasReply]);
	// biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text
	useLayoutEffect(() => {
		const input = inputRef.current;
		if (!input) return;
		input.style.height = "auto";
		input.style.height = `${Math.min(input.scrollHeight, MAX_HEIGHT_PX)}px`;
	}, [text]);

	const ready = text.trim() !== "";
	const send = () => {
		if (!ready) return;
		onSend(text.trim());
		setText("");
	};
	const cancel = () => {
		if (editing) setText("");
		onCancel();
	};
	const strip = editing
		? { icon: LuPencil, label: <Trans>Editing message</Trans>, text: "" }
		: replyingTo
			? {
					icon: LuReply,
					label: <Trans>Replying to {replyingTo.name}</Trans>,
					text: replyingTo.text,
				}
			: null;

	return (
		<div className="rounded-[14px] bg-fill-selected">
			{strip && (
				<div className="flex items-center gap-2 border-b border-border/60 py-1.5 pr-1.5 pl-3.5 text-xs">
					<strip.icon className="size-3.5 shrink-0 text-highlight" />
					<span className="shrink-0 font-medium">{strip.label}</span>
					<span className="min-w-0 flex-1 truncate text-muted-foreground">
						{strip.text}
					</span>
					<button
						type="button"
						aria-label={t({ message: "Cancel" })}
						onClick={cancel}
						className="flex size-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<LuX className="size-3.5" />
					</button>
				</div>
			)}
			<div className="flex items-end gap-1.5 p-1.5">
				<textarea
					ref={inputRef}
					value={text}
					rows={1}
					placeholder={placeholder}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={(event) => {
						if (event.nativeEvent.isComposing) return;
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							send();
						} else if (event.key === "Escape" && strip) {
							event.preventDefault();
							cancel();
						} else if (event.key === "ArrowUp" && text === "" && !strip) {
							event.preventDefault();
							onEditLast();
						}
					}}
					className="min-h-8 min-w-0 flex-1 resize-none bg-transparent px-2 py-[5px] text-sm leading-[22px] outline-none placeholder:text-muted-foreground/80"
				/>
				<button
					type="button"
					aria-label={t({ message: "Send" })}
					disabled={!ready}
					onClick={send}
					className={cn(
						"flex size-8 shrink-0 items-center justify-center rounded-lg transition-opacity",
						ready
							? "bg-highlight text-highlight-foreground"
							: "pointer-events-none opacity-0",
					)}
				>
					<LuArrowUp className="size-4" strokeWidth={2.5} />
				</button>
			</div>
		</div>
	);
}
