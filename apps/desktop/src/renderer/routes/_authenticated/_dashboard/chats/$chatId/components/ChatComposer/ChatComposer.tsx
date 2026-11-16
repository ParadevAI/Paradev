import { Trans, useLingui } from "@lingui/react/macro";
import {
	type MentionCandidate,
	matchMentions,
	mentionToken,
	moveSelection,
	parseMentionTokens,
	splitMentions,
} from "@superset/chats-core";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LuArrowUp, LuPencil, LuReply, LuX } from "react-icons/lu";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { withMentionTokens } from "./utils/withMentionTokens";

const MAX_HEIGHT_PX = 240;
const MAX_MENTION_ROWS = 6;
/** An @ and what follows it up to the caret, when the caret sits in one. */
const MENTION_QUERY = /(^|\s)@([^\s@]*)$/;

interface ChatComposerProps {
	placeholder: string;
	/** Who an @ can name in this chat. */
	candidates: MentionCandidate[];
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
	candidates,
	replyingTo,
	editing,
	onCancel,
	onSend,
	onEditLast,
}: ChatComposerProps) {
	const { t } = useLingui();
	const [text, setText] = useState("");
	const [caret, setCaret] = useState(0);
	const [picked, setPicked] = useState<MentionCandidate[]>([]);
	const [mentionIndex, setMentionIndex] = useState(0);
	const [isMentionClosed, setMentionClosed] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const candidatesRef = useRef(candidates);
	candidatesRef.current = candidates;
	const editingText = editing?.text;
	useEffect(() => {
		if (editingText !== undefined) {
			const named = parseMentionTokens(editingText).flatMap((ref) => {
				const candidate = candidatesRef.current.find(
					(entry) => entry.kind === ref.kind && entry.id === ref.id,
				);
				return candidate ? [candidate] : [];
			});
			setPicked(named);
			setText(
				splitMentions(editingText)
					.map((segment) => {
						if (segment.type === "text") return segment.text;
						const candidate = named.find(
							(entry) => entry.kind === segment.kind && entry.id === segment.id,
						);
						return candidate ? `@${candidate.label}` : mentionToken(segment);
					})
					.join(""),
			);
		}
		inputRef.current?.focus();
	}, [editingText]);

	const query = MENTION_QUERY.exec(text.slice(0, caret))?.[2];
	const matches =
		query === undefined || isMentionClosed
			? []
			: matchMentions(candidates, query).slice(0, MAX_MENTION_ROWS);
	const pick = (candidate: MentionCandidate) => {
		const start = caret - (query?.length ?? 0) - 1;
		const inserted = `@${candidate.label} `;
		const next = text.slice(0, start) + inserted + text.slice(caret);
		setText(next);
		setPicked((current) =>
			current.some(
				(entry) => entry.kind === candidate.kind && entry.id === candidate.id,
			)
				? current
				: [...current, candidate],
		);
		const position = start + inserted.length;
		setCaret(position);
		requestAnimationFrame(() => {
			inputRef.current?.focus();
			inputRef.current?.setSelectionRange(position, position);
		});
	};
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
		onSend(withMentionTokens(text.trim(), picked));
		setText("");
		setPicked([]);
	};
	const cancel = () => {
		if (editing) {
			setText("");
			setPicked([]);
		}
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
		<div className="relative rounded-[14px] bg-fill-selected">
			{matches.length > 0 && (
				<div
					role="listbox"
					className="absolute bottom-full left-2 z-20 mb-2 w-80 overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-lg"
				>
					{matches.map((candidate, index) => (
						<button
							key={`${candidate.kind}:${candidate.id}`}
							type="button"
							role="option"
							aria-selected={index === mentionIndex}
							onMouseDown={(event) => {
								event.preventDefault();
								pick(candidate);
							}}
							onMouseEnter={() => setMentionIndex(index)}
							className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm aria-selected:bg-fill-selected"
						>
							{candidate.kind === "dev" ? (
								<FaceAvatar seed={candidate.id} size={20} />
							) : (
								<Avatar size="xs" fullName={candidate.name} image={null} />
							)}
							<span className="min-w-0 flex-1 truncate font-medium">
								{candidate.label}
							</span>
							<span className="shrink-0 text-xs text-muted-foreground">
								{candidate.owner}
							</span>
						</button>
					))}
				</div>
			)}
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
					onChange={(event) => {
						setText(event.target.value);
						setCaret(event.target.selectionStart);
						setMentionClosed(false);
						setMentionIndex(0);
					}}
					onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
					onKeyDown={(event) => {
						if (event.nativeEvent.isComposing) return;
						if (matches.length > 0) {
							const move =
								event.key === "ArrowDown"
									? 1
									: event.key === "ArrowUp"
										? -1
										: 0;
							const chosen = matches[mentionIndex] ?? matches[0];
							if (move !== 0) {
								event.preventDefault();
								setMentionIndex(
									moveSelection(mentionIndex, move, matches.length),
								);
								return;
							}
							if ((event.key === "Enter" || event.key === "Tab") && chosen) {
								event.preventDefault();
								pick(chosen);
								return;
							}
							if (event.key === "Escape") {
								event.preventDefault();
								setMentionClosed(true);
								return;
							}
						}
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
