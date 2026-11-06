import { Plural, Trans } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { useNavigate } from "@tanstack/react-router";
import { LuHash } from "react-icons/lu";
import type { ChannelPerson } from "../../../../../$channelId/components/MessageBody";
import { NewMessagesLine } from "../../../../../$channelId/components/NewMessagesLine";
import {
	ThreadMessage,
	useDevFaces,
} from "../../../../../$channelId/components/ThreadMessage";
import { unreadState } from "../../../../../$channelId/utils/unreadState";

type FollowedThread = RouterOutputs["channelThread"]["list"][number];

interface ThreadCardProps {
	thread: FollowedThread;
	peopleById: Map<string, ChannelPerson>;
	currentUserId: string | null;
}

export function ThreadCard({
	thread,
	peopleById,
	currentUserId,
}: ThreadCardProps) {
	const navigate = useNavigate();
	const devsById = useDevFaces();
	const { root, latestReplies } = thread;
	const hidden = root.replyCount - latestReplies.length;
	const { firstUnread } = unreadState(
		latestReplies,
		thread.lastReadSeq,
		currentUserId,
	);
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
			<ThreadMessage
				message={root}
				peopleById={peopleById}
				devsById={devsById}
				currentUserId={currentUserId}
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
					<ThreadMessage
						message={reply}
						peopleById={peopleById}
						devsById={devsById}
						currentUserId={currentUserId}
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
