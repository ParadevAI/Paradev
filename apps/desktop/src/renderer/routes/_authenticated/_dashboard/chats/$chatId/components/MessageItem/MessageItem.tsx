import { Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import {
	type ChatState,
	canDeleteMessage,
	canEditMessage,
	type Message,
	type QuestionPartAnswer,
	renderMentions,
	type SharedFile,
} from "@superset/chats-core";
import { formatClockTime, formatDateTime } from "@superset/i18n/format";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { memo } from "react";
import { LuCopy, LuInfo, LuPencil, LuReply, LuTrash2 } from "react-icons/lu";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";
import { MessageFile } from "./components/MessageFile";
import { MessageLink } from "./components/MessageLink";
import { QuestionCard } from "./components/QuestionCard";
import { MessageAuthorDevProvider } from "./providers/MessageAuthorDevProvider";
import { mentionMarkdown } from "./utils/mentionMarkdown";

const MINE =
	"bg-[color-mix(in_oklab,var(--color-highlight)_22%,var(--color-background))] rounded-br-md";
const THEIRS = "bg-fill-selected rounded-bl-md";
const MARKDOWN_COMPONENTS = { a: MessageLink };
const ACTION =
	"flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-fill-hover hover:text-foreground";

export interface MessageActions {
	reply: (message: Message) => void;
	edit: (message: Message) => void;
	copy: (message: Message) => void;
	remove: (message: Message) => void;
	retry: (message: Message) => void;
	discard: (message: Message) => void;
	jumpTo: (messageId: string) => void;
	answerQuestion: (questionId: string, answer: string, typed: boolean) => void;
	answerForm: (questionId: string, answers: QuestionPartAnswer[]) => void;
	/** Shows what the Dev did to write the message. */
	details: (message: Message) => void;
	fileLink: (fileId: string) => Promise<string>;
	openFile: (file: SharedFile) => void;
}

interface MessageItemProps {
	state: ChatState;
	message: Message;
	/** Opens a run of one author's bubbles: the name goes above it. */
	first: boolean;
	/** Ends the run: the face sits beside it. */
	last: boolean;
	/** A group: others' messages say who wrote them. */
	isGroup: boolean;
	isHighlighted: boolean;
	actions: MessageActions;
}

/**
 * One message as a messenger draws it: yours on the right in the accent tint,
 * others' on the left, a run stacked tight with the name above its first
 * bubble and the face beside its last. A message with no author is a centred
 * note. Memoized: the thread re-renders often, a row only when it changed.
 */
export const MessageItem = memo(function MessageItem({
	state,
	message,
	first,
	last,
	isGroup,
	isHighlighted,
	actions,
}: MessageItemProps) {
	const { t } = useLingui();
	const nameOf = (ref: { kind: "dev" | "user"; id: string }) =>
		(ref.kind === "dev"
			? state.devs[ref.id]?.name
			: state.members[ref.id]?.name) ?? t({ message: "someone" });
	const agent = message.authorDevId
		? state.devs[message.authorDevId]
		: undefined;

	if (message.authorId === null && !message.authorDevId) {
		return (
			<div className="flex items-center justify-center gap-1.5 px-8 py-2 text-center text-xs text-muted-foreground">
				<LuInfo className="size-3 shrink-0" />
				{renderMentions(message.text, nameOf)}
			</div>
		);
	}

	const mine = message.authorId === state.meId;
	const showsSender = isGroup && !mine;
	const author =
		agent?.name ??
		(message.authorId ? state.members[message.authorId]?.name : undefined) ??
		t({ message: "Unknown" });
	const sentAt = new Date(message.at);
	const failed = message.upload?.error;
	const isSending = message.id.startsWith("local-") && !failed;

	return (
		<div
			data-message-id={message.id}
			className={cn(
				"group/msg flex px-4",
				mine ? "justify-end" : "justify-start",
				first ? "pt-2.5" : "pt-0.5",
			)}
		>
			{showsSender && (
				<div className="mr-2 flex w-6 shrink-0 items-end">
					{last &&
						(agent ? (
							<DevFace devId={agent.id} size={24} />
						) : (
							<Avatar size="sm" fullName={author} image={null} />
						))}
				</div>
			)}
			<div
				className={cn(
					"relative flex max-w-[70%] min-w-0 flex-col",
					mine ? "items-end" : "items-start",
				)}
			>
				{showsSender && first && (
					<span className="mb-0.5 px-3.5 text-xs text-muted-foreground">
						{author}
					</span>
				)}
				<div
					data-bubble
					className={cn(
						"min-w-0 max-w-full cursor-text rounded-[20px] px-3.5 py-2 text-sm leading-relaxed select-text [&_p]:my-0.5",
						mine ? MINE : THEIRS,
						!first && (mine ? "rounded-tr-md" : "rounded-tl-md"),
						isSending && "opacity-60",
						isHighlighted && "ring-2 ring-highlight/60",
					)}
				>
					{message.replyTo && (
						<button
							type="button"
							onClick={() =>
								message.replyTo && actions.jumpTo(message.replyTo.id)
							}
							className="mb-1 block max-w-full border-l-2 border-highlight/60 pl-2 text-left text-xs text-muted-foreground hover:text-foreground"
						>
							<span className="block font-medium">
								{message.replyTo.authorName}
							</span>
							<span className="block truncate">{message.replyTo.text}</span>
						</button>
					)}
					{message.file && (
						<div className={cn("py-1", message.text && "pb-1.5")}>
							<MessageFile
								file={message.file}
								localUri={message.localUri}
								upload={message.upload}
								link={actions.fileLink}
								onOpen={actions.openFile}
							/>
						</div>
					)}
					{message.question && (
						<QuestionCard
							state={state}
							chatId={message.chatId}
							question={message.question}
							onAnswer={actions.answerQuestion}
							onAnswerForm={actions.answerForm}
						/>
					)}
					{message.text && !message.question && (
						<MessageAuthorDevProvider value={message.authorDevId ?? null}>
							<ChatMarkdown components={MARKDOWN_COMPONENTS}>
								{mentionMarkdown(message.text, nameOf)}
							</ChatMarkdown>
						</MessageAuthorDevProvider>
					)}
				</div>
				{message.editedAt && (
					<span className="px-1.5 text-[11px] text-muted-foreground">
						<Trans>Edited</Trans>
					</span>
				)}
				{failed !== undefined && (
					<span className="flex items-center gap-2 px-1.5 text-[11px] text-destructive">
						<Trans>Not delivered</Trans>
						<button
							type="button"
							className="font-medium underline"
							onClick={() => actions.retry(message)}
						>
							<Trans>Retry</Trans>
						</button>
						<button
							type="button"
							className="font-medium underline"
							onClick={() => actions.discard(message)}
						>
							<Trans>Delete</Trans>
						</button>
					</span>
				)}
				{!isSending && failed === undefined && (
					<div
						className={cn(
							"pointer-events-none absolute z-10 flex items-center gap-0.5 whitespace-nowrap opacity-0 transition-opacity duration-100 group-hover/msg:pointer-events-auto group-hover/msg:opacity-100",
							showsSender && first ? "top-[26px]" : "top-1.5",
							mine ? "right-full mr-1.5 flex-row-reverse" : "left-full ml-1.5",
						)}
					>
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<span className="px-1 text-[11px] text-muted-foreground tabular-nums">
									{formatClockTime(sentAt)}
								</span>
							</TooltipTrigger>
							<TooltipContent>{formatDateTime(sentAt)}</TooltipContent>
						</Tooltip>
						<button
							type="button"
							aria-label={t({ message: "Reply" })}
							className={ACTION}
							onClick={() => actions.reply(message)}
						>
							<LuReply className="size-3.5" />
						</button>
						{canEditMessage(state, message) && (
							<button
								type="button"
								aria-label={t({ message: "Edit message" })}
								className={ACTION}
								onClick={() => actions.edit(message)}
							>
								<LuPencil className="size-3.5" />
							</button>
						)}
						{message.turnId && (
							<button
								type="button"
								aria-label={t({ message: "Message details" })}
								className={ACTION}
								onClick={() => actions.details(message)}
							>
								<LuInfo className="size-3.5" />
							</button>
						)}
						<button
							type="button"
							aria-label={t({ message: "Copy message" })}
							className={ACTION}
							onClick={() => actions.copy(message)}
						>
							<LuCopy className="size-3.5" />
						</button>
						{canDeleteMessage(state, message) && (
							<button
								type="button"
								aria-label={t({ message: "Delete message" })}
								className={ACTION}
								onClick={() => actions.remove(message)}
							>
								<LuTrash2 className="size-3.5" />
							</button>
						)}
					</div>
				)}
			</div>
		</div>
	);
});
