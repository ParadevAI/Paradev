import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import { errorMessage } from "@superset/i18n/errors";
import { formatDateTime, formatRelativeTime } from "@superset/i18n/format";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { toast } from "@superset/ui/sonner";
import { Textarea } from "@superset/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { cn } from "@superset/ui/utils";
import { useState } from "react";
import { LuMessageSquare, LuPencil, LuTrash2 } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useApplyChannelMessage } from "renderer/routes/_authenticated/hooks/useApplyChannelMessage";
import {
	type ChannelMessage,
	PENDING_SEQ,
} from "renderer/routes/_authenticated/utils/channelMessageCache";
import { RowAction } from "./components/RowAction";

export interface ChannelPerson {
	id: string;
	name: string;
	image: string | null;
}

interface ChannelMessageRowProps {
	message: ChannelMessage;
	author: ChannelPerson | null;
	compact: boolean;
	now: Date;
	currentUserId: string | null;
	canModerate: boolean;
	onOpenThread?: (message: ChannelMessage) => void;
}

export function ChannelMessageRow({
	message,
	author,
	compact,
	now,
	currentUserId,
	canModerate,
	onOpenThread,
}: ChannelMessageRowProps) {
	const { t } = useLingui();
	const { apply } = useApplyChannelMessage();
	const [draft, setDraft] = useState<string | null>(null);
	const isPending = message.seq === PENDING_SEQ;
	const isDeleted = message.deletedAt !== null;
	const isOwn = message.authorUserId === currentUserId;
	const onError = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const edit = cloudTrpc.channelMessage.edit.useMutation({
		onSuccess: (updated) => {
			apply(updated);
			setDraft(null);
		},
		onError,
	});
	const remove = cloudTrpc.channelMessage.delete.useMutation({
		onSuccess: apply,
		onError,
	});

	const saveEdit = () => {
		if (draft === null) return;
		const body = draft.trim();
		if (!body || body === message.body) {
			setDraft(null);
			return;
		}
		edit.mutate({
			messageId: message.id,
			body,
			mentionedUserIds: message.mentionedUserIds,
		});
	};

	const authorName = author?.name ?? t({ message: "Unknown" });
	const time = formatDateTime(message.createdAt, { timeStyle: "short" });

	return (
		<div
			className={cn(
				"group relative flex gap-2.5 px-4 hover:bg-fill-hover/40",
				compact ? "py-0.5" : "pt-2 pb-0.5",
				isPending && "opacity-60",
			)}
		>
			<div className="w-8 shrink-0">
				{compact ? (
					<span className="invisible block pt-1 text-right text-[10px] text-muted-foreground tabular-nums group-hover:visible">
						{time}
					</span>
				) : (
					<Avatar size="md" fullName={authorName} image={author?.image} />
				)}
			</div>
			<div className="min-w-0 flex-1">
				{!compact && (
					<div className="flex items-baseline gap-2">
						<span className="text-sm font-semibold">{authorName}</span>
						<Tooltip delayDuration={500}>
							<TooltipTrigger asChild>
								<span className="text-[11px] text-muted-foreground tabular-nums">
									{time}
								</span>
							</TooltipTrigger>
							<TooltipContent>
								{formatDateTime(message.createdAt)}
							</TooltipContent>
						</Tooltip>
					</div>
				)}
				{isDeleted ? (
					<p className="text-sm text-muted-foreground italic">
						<Trans>This message was deleted</Trans>
					</p>
				) : draft !== null ? (
					<div className="flex flex-col gap-1 py-1">
						<Textarea
							autoFocus
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !event.shiftKey) {
									event.preventDefault();
									saveEdit();
								}
								if (event.key === "Escape") setDraft(null);
							}}
							className="min-h-16 text-sm"
						/>
					</div>
				) : (
					<div className="text-sm [&_p]:my-0.5">
						<ChatMarkdown>{message.body}</ChatMarkdown>
						{message.editedAt && (
							<span className="text-[11px] text-muted-foreground">
								<Trans>(edited)</Trans>
							</span>
						)}
					</div>
				)}
				{onOpenThread && message.replyCount > 0 && (
					<button
						type="button"
						onClick={() => onOpenThread(message)}
						className="mt-1 mb-1 flex items-center gap-2 rounded-md px-1 py-0.5 -mx-1 text-xs hover:bg-fill-hover"
					>
						<span className="font-medium text-primary">
							<Plural
								value={message.replyCount}
								one="# reply"
								other="# replies"
							/>
						</span>
						{message.lastReplyAt && (
							<span className="text-muted-foreground">
								<Trans>
									Last reply{" "}
									{formatRelativeTime(
										Math.min(message.lastReplyAt.getTime(), now.getTime()),
										now,
									)}
								</Trans>
							</span>
						)}
					</button>
				)}
			</div>
			{!isPending && !isDeleted && draft === null && (
				<div className="absolute -top-3 right-4 hidden items-center rounded-md border border-border bg-popover shadow-sm group-hover:flex">
					{onOpenThread && (
						<RowAction
							label={t({ message: "Reply in thread" })}
							onClick={() => onOpenThread(message)}
						>
							<LuMessageSquare className="size-3.5" />
						</RowAction>
					)}
					{isOwn && (
						<RowAction
							label={t({ message: "Edit message" })}
							onClick={() => setDraft(message.body)}
						>
							<LuPencil className="size-3.5" />
						</RowAction>
					)}
					{(isOwn || canModerate) && (
						<RowAction
							label={t({ message: "Delete message" })}
							onClick={() => remove.mutate({ messageId: message.id })}
						>
							<LuTrash2 className="size-3.5" />
						</RowAction>
					)}
				</div>
			)}
		</div>
	);
}
