import { ChatMarkdown } from "@superset/chat-ui/ChatMarkdown";
import {
	activityLine,
	type ChatState,
	type TaskActivity,
} from "@superset/chats-core";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { cn } from "@superset/ui/utils";
import { LuBell, LuCircleAlert } from "react-icons/lu";
import { DevFace } from "renderer/routes/_authenticated/_dashboard/chats/components/DevFace";

interface TaskActivityItemProps {
	state: ChatState;
	entry: TaskActivity;
	now: Date;
}

/**
 * One entry on a task's timeline. What happened is a quiet line; a Dev's
 * progress note is ruled on the left; a person's comment sits in a bubble; a
 * failure is red.
 */
export function TaskActivityItem({ state, entry, now }: TaskActivityItemProps) {
	const line = activityLine(state, entry, now);
	const who = line.who;
	const time = (
		<time className="shrink-0 text-muted-foreground text-xs tabular-nums">
			{formatCompactRelativeTime(new Date(entry.at), now)}
		</time>
	);
	const face = who ? (
		who.kind === "dev" ? (
			<DevFace devId={who.id} size={18} />
		) : (
			<Avatar size="xs" fullName={who.name} image={null} />
		)
	) : (
		<span className="flex size-[18px] shrink-0 items-center justify-center rounded-md bg-fill-selected text-muted-foreground">
			{line.tone === "failed" ? (
				<LuCircleAlert className="size-3 text-destructive" />
			) : (
				<LuBell className="size-3" />
			)}
		</span>
	);

	if (line.tone === "event" || line.tone === "failed") {
		return (
			<li className="flex items-center gap-2.5 py-1.5 text-sm">
				{face}
				<p
					className={cn(
						"min-w-0 flex-1 leading-5",
						line.tone === "failed"
							? "text-destructive"
							: "text-muted-foreground",
					)}
				>
					{who && (
						<span className="font-medium text-foreground">{who.name} </span>
					)}
					{line.text}
				</p>
				{time}
			</li>
		);
	}

	return (
		<li className="flex items-start gap-2.5 py-2">
			<span className="mt-0.5">{face}</span>
			<div className="flex min-w-0 flex-1 flex-col gap-1">
				<div className="flex items-baseline gap-2 text-sm">
					<span className="font-medium">{who?.name}</span>
					<span className="ml-auto">{time}</span>
				</div>
				<div
					className={cn(
						"text-sm [&_p]:my-0.5",
						line.tone === "comment"
							? "rounded-lg bg-fill-selected px-3 py-2"
							: "border-border border-l-2 pl-3",
					)}
				>
					<ChatMarkdown>{line.text}</ChatMarkdown>
				</div>
			</div>
		</li>
	);
}
