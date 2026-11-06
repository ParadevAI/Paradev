import { Trans, useLingui } from "@lingui/react/macro";
import {
	readBookkeeping,
	transcriptItemKey,
	userMessageText,
} from "@superset/chat/core";
import type { AvailableCommand, UserMessage } from "@superset/chat/protocol";
import { AttachmentFileCard } from "@superset/chat-ui/AttachmentFileCard";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";
import { useTranscriptCards } from "../../../../providers/TranscriptCardsProvider";
import {
	attachmentDisplayName,
	parseAttachmentTags,
} from "../../../../utils/attachmentTags";
import {
	type MessageSegment,
	splitByElements,
} from "../../../../utils/messageElements";
import { CopyButton } from "../../../CopyButton";
import { AttachmentImage } from "../AttachmentImage";
import { MessageTime } from "../MessageTime";
import { AttachmentPartImage } from "./components/AttachmentPartImage";
import { PastedTextBlock } from "./components/PastedTextBlock";
import { UserMessageEditor } from "./components/UserMessageEditor";
import { UserMessageText } from "./components/UserMessageText";
import { useFitsOneLine } from "./hooks/useFitsOneLine";
import { textElementsFromText } from "./utils/textElementsFromText";

function BookkeepingRow({ label }: { label: string }) {
	return (
		<div className="flex min-w-0 items-center py-1 font-sans text-foreground/50 text-sm">
			<span className="min-w-0 truncate first-letter:uppercase">{label}</span>
		</div>
	);
}

export type PendingPrompt = {
	failed: boolean;
	onRetry: () => void;
	onDiscard: () => void;
};

export function UserMessageRow({
	commands,
	harness,
	item,
	pending,
	sender,
}: {
	item: UserMessage;
	sender?: string | undefined;
	commands?: ReadonlyMap<string, AvailableCommand> | undefined;
	/** Which harness spelled this turn; its reader decides what is bookkeeping. */
	harness: string | undefined;
	pending?: PendingPrompt | undefined;
}) {
	const { t } = useLingui();
	const raw = userMessageText(item);
	const note = readBookkeeping(harness, raw);
	const { text, attachments, pastedTexts } = parseAttachmentTags(raw);
	const elements = item.content.find((part) => part.type === "text")?.elements;
	const segments: MessageSegment[] = splitByElements(
		text,
		elements?.length ? elements : textElementsFromText(text, commands),
	);
	const textRef = useRef<HTMLDivElement>(null);
	const oneLine = useFitsOneLine(textRef);
	const { editMessage, editableMessageIds } = useChatPaneActions();
	const flat = useTranscriptCards().speakers !== undefined;
	const [editing, setEditing] = useState(false);
	if (note && !pending) return <BookkeepingRow label={note.label} />;

	const images = attachments.filter((attachment) =>
		attachment.type.startsWith("image/"),
	);
	const parts = item.content.flatMap((content) =>
		content.type === "attachment" ? [content] : [],
	);
	const partKey = (part: (typeof parts)[number], index: number) =>
		part.fileId ?? part.attachmentId ?? `${part.name}-${index}`;
	const imageParts = parts.filter((part) => part.mimeType.startsWith("image/"));
	const files = [
		...attachments
			.filter((attachment) => !attachment.type.startsWith("image/"))
			.map((attachment) => ({
				key: attachment.path,
				name: attachmentDisplayName(attachment),
				mediaType: attachment.type,
			})),
		...parts
			.filter((part) => !part.mimeType.startsWith("image/"))
			.map((part, index) => ({
				key: partKey(part, index),
				name: part.name,
				mediaType: part.mimeType,
			})),
	];
	const copyable = (text.length > 0 || pastedTexts.length > 0) && !pending;
	const copyText = [text, ...pastedTexts].filter(Boolean).join("\n\n");
	const editable =
		copyable &&
		editMessage !== undefined &&
		editableMessageIds?.has(item.id) === true &&
		attachments.length === 0 &&
		pastedTexts.length === 0 &&
		files.length === 0 &&
		imageParts.length === 0;
	if (editing && editable) {
		return (
			<Message
				className={flat ? "pt-0.5 pb-2" : "pt-1.5 pb-5 pl-10"}
				from={flat ? "assistant" : "user"}
			>
				<UserMessageEditor
					initialText={text}
					onCancel={() => setEditing(false)}
					onSubmit={(edited) => {
						setEditing(false);
						editMessage(item.id, edited);
					}}
				/>
			</Message>
		);
	}
	return (
		<Message
			className={cn(
				"group/message",
				flat
					? "relative gap-1.5 pt-0.5 pb-2"
					: cn("pt-1.5 pl-10", copyable ? "pb-0" : "pb-5"),
			)}
			from={flat ? "assistant" : "user"}
		>
			{sender && !flat && (
				<span className="self-end font-sans text-foreground/45 text-xs">
					{sender}
				</span>
			)}
			{(images.length > 0 || imageParts.length > 0) && (
				<div
					className={cn(
						"flex max-w-[min(100%,36rem)] flex-wrap gap-2 transition-opacity",
						!flat && "ml-auto justify-end",
						pending && !pending.failed && "opacity-60",
					)}
				>
					{images.map((image) => (
						<AttachmentImage
							key={image.path}
							owner={transcriptItemKey(item)}
							name={attachmentDisplayName(image)}
							path={image.path}
							type={image.type}
						/>
					))}
					{imageParts.map((part, index) => (
						<AttachmentPartImage key={partKey(part, index)} part={part} />
					))}
				</div>
			)}
			{files.length > 0 && (
				<div
					className={cn(
						"flex max-w-[min(100%,36rem)] flex-wrap gap-2 transition-opacity",
						!flat && "ml-auto justify-end",
						pending && !pending.failed && "opacity-60",
					)}
				>
					{files.map((file) => (
						<AttachmentFileCard
							className="w-auto min-w-40 max-w-72"
							key={file.key}
							name={file.name}
							mediaType={file.mediaType}
						/>
					))}
				</div>
			)}
			{pastedTexts.length > 0 && (
				<div
					className={cn(
						"flex w-full flex-col gap-1.5 transition-opacity",
						flat ? "items-start" : "ml-auto items-end",
						pending && !pending.failed && "opacity-60",
					)}
				>
					{pastedTexts.map((pasted, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: pastes have no identity beyond their order
						<PastedTextBlock key={index} text={pasted} />
					))}
				</div>
			)}
			{text && (
				<MessageContent
					className={cn(
						"font-sans transition-opacity",
						!flat &&
							"max-w-[min(100%,36rem)] group-[.is-user]:bg-foreground/10 group-[.is-user]:px-3 group-[.is-user]:py-2",
						!flat &&
							(oneLine
								? "group-[.is-user]:rounded-full"
								: "group-[.is-user]:rounded-xl"),
						pending && !pending.failed && "opacity-60",
					)}
				>
					<div
						className="break-words text-sm"
						data-find-item={item.id}
						ref={textRef}
					>
						<UserMessageText commands={commands} segments={segments} />
					</div>
				</MessageContent>
			)}
			{copyable && (
				<div
					className={cn(
						"flex items-center gap-2 text-muted-foreground/60 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100",
						flat
							? "absolute -top-3 right-0 rounded-md border border-border bg-background px-1.5 py-0.5 shadow-sm"
							: "-mt-1.5 justify-end",
					)}
				>
					{!flat && <MessageTime atMs={item.startedAtMs} />}
					<Tooltip>
						<TooltipTrigger asChild>
							<span>
								<CopyButton
									label={t({ message: "Copy message" })}
									text={copyText}
								/>
							</span>
						</TooltipTrigger>
						<TooltipContent>
							<Trans>Copy message</Trans>
						</TooltipContent>
					</Tooltip>
					{editable && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									aria-label={t({ message: "Edit message" })}
									className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground"
									onClick={() => setEditing(true)}
									type="button"
								>
									<Pencil className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent>
								<Trans>Edit message</Trans>
							</TooltipContent>
						</Tooltip>
					)}
				</div>
			)}
			{pending?.failed && (
				<div
					className={cn(
						"flex items-center gap-2",
						flat ? "self-start" : "self-end",
					)}
				>
					<Badge variant="destructive">
						<Trans>Failed to send</Trans>
					</Badge>
					<Button onClick={pending.onRetry} size="sm" variant="ghost">
						<Trans>Retry</Trans>
					</Button>
					<Button onClick={pending.onDiscard} size="sm" variant="ghost">
						<Trans>Discard</Trans>
					</Button>
				</div>
			)}
		</Message>
	);
}
