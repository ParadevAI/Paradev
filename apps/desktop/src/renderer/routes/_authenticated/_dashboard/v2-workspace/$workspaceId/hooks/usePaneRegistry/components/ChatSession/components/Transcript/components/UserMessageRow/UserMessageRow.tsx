import { Trans, useLingui } from "@lingui/react/macro";
import {
	readBookkeeping,
	transcriptItemKey,
	userMessageText,
} from "@superset/chat/core";
import type { AvailableCommand, UserMessage } from "@superset/chat/protocol";
import { Message, MessageContent } from "@superset/ui/ai-elements/message";
import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { Pencil } from "lucide-react";
import { useRef, useState } from "react";
import { useChatPaneActions } from "../../../../providers/ChatPaneActionsProvider";
import { parseAttachmentTags } from "../../../../utils/attachmentTags";
import {
	type MessageSegment,
	splitByElements,
} from "../../../../utils/messageElements";
import { CopyButton } from "../../../CopyButton";
import { AttachmentImage } from "../AttachmentImage";
import { MessageTime } from "../MessageTime";
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
	const [editing, setEditing] = useState(false);
	if (note && !pending) return <BookkeepingRow label={note.label} />;

	const images = attachments.filter((attachment) =>
		attachment.type.startsWith("image/"),
	);
	const files = [
		...attachments
			.filter((attachment) => !attachment.type.startsWith("image/"))
			.map((attachment) => ({
				key: attachment.path,
				name: attachment.path.split("/").pop() ?? attachment.path,
			})),
		...item.content.flatMap((content) =>
			content.type === "attachment"
				? [{ key: content.attachmentId, name: content.name }]
				: [],
		),
	];
	const copyable = (text.length > 0 || pastedTexts.length > 0) && !pending;
	const copyText = [text, ...pastedTexts].filter(Boolean).join("\n\n");
	const editable =
		copyable &&
		editMessage !== undefined &&
		editableMessageIds?.has(item.id) === true &&
		attachments.length === 0 &&
		pastedTexts.length === 0 &&
		files.length === 0;
	if (editing && editable) {
		return (
			<Message className="pt-1.5 pb-5 pl-10" from="user">
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
			className={cn("group/message pt-1.5 pl-10", copyable ? "pb-0" : "pb-5")}
			from="user"
		>
			{sender && (
				<span className="self-end font-sans text-foreground/45 text-xs">
					{sender}
				</span>
			)}
			{images.length > 0 && (
				<div
					className={cn(
						"ml-auto flex max-w-[min(100%,36rem)] flex-wrap justify-end gap-2 transition-opacity",
						pending && !pending.failed && "opacity-60",
					)}
				>
					{images.map((image) => (
						<AttachmentImage
							key={image.path}
							owner={transcriptItemKey(item)}
							path={image.path}
							type={image.type}
						/>
					))}
				</div>
			)}
			{pastedTexts.length > 0 && (
				<div
					className={cn(
						"ml-auto flex w-full flex-col items-end gap-1.5 transition-opacity",
						pending && !pending.failed && "opacity-60",
					)}
				>
					{pastedTexts.map((pasted, index) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: pastes have no identity beyond their order
						<PastedTextBlock key={index} text={pasted} />
					))}
				</div>
			)}
			{(text || files.length > 0) && (
				<MessageContent
					className={cn(
						"max-w-[min(100%,36rem)] font-sans transition-opacity group-[.is-user]:bg-foreground/10 group-[.is-user]:px-3 group-[.is-user]:py-2",
						oneLine && files.length === 0
							? "group-[.is-user]:rounded-full"
							: "group-[.is-user]:rounded-xl",
						pending && !pending.failed && "opacity-60",
					)}
				>
					<div
						className="whitespace-pre-wrap break-words text-sm"
						data-find-item={item.id}
						ref={textRef}
					>
						<UserMessageText commands={commands} segments={segments} />
					</div>
					{files.length > 0 && (
						<div className="mt-1 flex flex-wrap gap-1">
							{files.map((file) => (
								<Badge key={file.key} variant="secondary">
									{file.name}
								</Badge>
							))}
						</div>
					)}
				</MessageContent>
			)}
			{copyable && (
				<div className="-mt-1.5 flex items-center justify-end gap-2 text-muted-foreground/60 opacity-0 transition-opacity focus-within:opacity-100 group-hover/message:opacity-100">
					<MessageTime atMs={item.startedAtMs} />
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
				<div className="flex items-center gap-2 self-end">
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
