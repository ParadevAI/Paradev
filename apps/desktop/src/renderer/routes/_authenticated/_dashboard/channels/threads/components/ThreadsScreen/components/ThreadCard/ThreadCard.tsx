import { Plural, Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { useNavigate } from "@tanstack/react-router";
import { LuHash } from "react-icons/lu";
import {
	ChannelMessageRow,
	type ChannelPerson,
} from "../../../../../$channelId/components/ChannelMessageRow";
import { NewMessagesLine } from "../../../../../$channelId/components/NewMessagesLine";
import { unreadState } from "../../../../../$channelId/utils/unreadState";

type FollowedThread = RouterOutputs["channelThread"]["list"][number];

interface ThreadCardProps {
	thread: FollowedThread;
	peopleById: Map<string, ChannelPerson>;
	currentUserId: string | null;
	now: Date;
}

export function ThreadCard({
	thread,
	peopleById,
	currentUserId,
	now,
}: ThreadCardProps) {
	const navigate = useNavigate();
	const { root, latestReplies } = thread;
	const hidden = root.replyCount - latestReplies.length;
	const { firstUnread } = unreadState(
		latestReplies,
		thread.lastReadSeq,
		currentUserId,
	);
	const authorOf = (id: string | null) =>
		id ? (peopleById.get(id) ?? null) : null;
	const openThread = () =>
		void navigate({
			to: "/channels/$channelId",
			params: { channelId: thread.channelId },
			search: { thread: thread.rootId },
		});

	return (
		<div className="overflow-hidden rounded-lg border border-border">
			<div className="flex items-center gap-2 px-4 pt-3 pb-1">
				<button
					type="button"
					onClick={() =>
						void navigate({
							to: "/channels/$channelId",
							params: { channelId: thread.channelId },
						})
					}
					className="flex items-center gap-0.5 text-sm font-bold hover:underline"
				>
					<LuHash className="size-3.5" />
					{thread.channelName}
				</button>
				{thread.unreadCount > 0 && (
					<span className="text-xs text-muted-foreground">
						<Plural
							value={thread.unreadCount}
							one="# new reply"
							other="# new replies"
						/>
					</span>
				)}
			</div>
			<ChannelMessageRow
				message={root}
				author={authorOf(root.authorId)}
				compact={false}
				now={now}
				currentUserId={currentUserId}
				canModerate={false}
				canReact={false}
				peopleById={peopleById}
			/>
			{hidden > 0 && (
				<button
					type="button"
					onClick={openThread}
					className="ml-[3.75rem] py-1 text-xs font-medium text-primary hover:underline"
				>
					<Plural
						value={hidden}
						one="Show # more reply"
						other="Show # more replies"
					/>
				</button>
			)}
			{latestReplies.map((reply) => (
				<div key={reply.id}>
					{reply.id === firstUnread?.id && <NewMessagesLine />}
					<ChannelMessageRow
						message={reply}
						author={authorOf(reply.authorId)}
						compact={false}
						now={now}
						currentUserId={currentUserId}
						canModerate={false}
						canReact={false}
						peopleById={peopleById}
					/>
				</div>
			))}
			<div className="px-4 pt-1 pb-3">
				<button
					type="button"
					onClick={openThread}
					className="h-7 rounded-md border border-border px-3 text-xs font-medium hover:bg-fill-hover"
				>
					<Trans>Reply</Trans>
				</button>
			</div>
		</div>
	);
}
