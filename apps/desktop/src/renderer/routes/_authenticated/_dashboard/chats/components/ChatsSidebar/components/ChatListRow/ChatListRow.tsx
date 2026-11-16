import { useLingui } from "@lingui/react/macro";
import type { ChatRow } from "@superset/chats-core";
import { cn } from "@superset/ui/utils";
import { memo } from "react";
import { LuMessageCircleQuestion, LuPin } from "react-icons/lu";
import { listTime } from "../../../../utils/listTime";
import { ChatFace } from "../../../ChatFace";

interface ChatListRowProps {
	row: ChatRow;
	now: Date;
	isActive: boolean;
	/** A Dev is working in this chat. */
	isWorking: boolean;
	onOpen: (chatId: string) => void;
}

/**
 * A conversation row: the chat's face, its name with when it last moved, and
 * the last message on one muted line. Unread messages make the name bold with
 * their count; a Dev's question waiting on you shows in the accent colour.
 */
export const ChatListRow = memo(function ChatListRow({
	row,
	now,
	isActive,
	isWorking,
	onOpen,
}: ChatListRowProps) {
	const { t } = useLingui();
	const needsYou = row.unread > 0 || !!row.asking;
	return (
		<button
			type="button"
			aria-current={isActive ? "page" : undefined}
			onClick={() => onOpen(row.chat.id)}
			className={cn(
				"flex w-full min-w-0 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
				isActive ? "bg-fill-selected" : "hover:bg-fill-hover",
			)}
		>
			<ChatFace chat={row.chat} size={36} />
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="flex min-w-0 items-baseline gap-1.5">
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-[13px] leading-5 tracking-[-0.01em]",
							needsYou ? "font-semibold" : "font-medium",
						)}
					>
						{row.title}
					</span>
					{isWorking && (
						<output
							aria-label={t({ message: "Working" })}
							className="size-1.5 shrink-0 self-center rounded-full bg-highlight motion-safe:animate-pulse"
						/>
					)}
					{row.at && (
						<time
							className={cn(
								"shrink-0 text-[11px] tabular-nums",
								needsYou ? "text-highlight" : "text-muted-foreground",
							)}
						>
							{listTime(new Date(row.at), now)}
						</time>
					)}
				</span>
				<span className="flex min-w-0 items-center gap-1.5">
					<span
						className={cn(
							"min-w-0 flex-1 truncate text-xs leading-[18px]",
							row.asking ? "text-highlight" : "text-muted-foreground",
						)}
					>
						{row.asking ?? (row.preview || t({ message: "No messages yet" }))}
					</span>
					{row.asking ? (
						<LuMessageCircleQuestion className="size-3.5 shrink-0 text-highlight" />
					) : row.unread > 0 ? (
						<span className="min-w-[18px] shrink-0 rounded-full bg-highlight px-1.5 text-center text-[11px] leading-[18px] font-medium text-highlight-foreground tabular-nums">
							{row.unread}
						</span>
					) : (
						row.pinned && (
							<LuPin className="size-3 shrink-0 text-muted-foreground" />
						)
					)}
				</span>
			</span>
		</button>
	);
});
