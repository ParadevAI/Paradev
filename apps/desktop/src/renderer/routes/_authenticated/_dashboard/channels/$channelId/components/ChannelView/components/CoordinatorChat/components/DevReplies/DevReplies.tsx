import { useLingui } from "@lingui/react/macro";
import { useMemo } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useOrganizationPeople } from "renderer/routes/_authenticated/_dashboard/hooks/useOrganizationPeople";
import { useChannelPaneStore } from "../../../../../../stores/channelPaneStore";
import { useDevFaces } from "../../../../../ThreadMessage";
import { DevPickup } from "./components/DevPickup";
import { DevReply } from "./components/DevReply";
import { isSaved, POSTED_WINDOW_MS, postedRoot } from "./utils/devReplies";

const SHOWN_REPLIES = 3;
const THREAD_POLL_MS = 5_000;

interface DevRepliesProps {
	channelId: string;
	/** The person's words as the coordinator got them, which were also posted to the channel. */
	text: string;
	postedAt: number;
	devIds: readonly string[];
}

/**
 * Under a message that named Devs: their answers from the channel thread it
 * started, a line while one is on it or once one failed to, and a way into
 * the thread to keep talking.
 */
export function DevReplies({
	channelId,
	text,
	postedAt,
	devIds,
}: DevRepliesProps) {
	const { t } = useLingui();
	const { people, currentUserId } = useOrganizationPeople();
	const peopleById = useMemo(
		() => new Map(people.map((person) => [person.id, person])),
		[people],
	);
	const devsById = useDevFaces();
	const pushPage = useChannelPaneStore((state) => state.push);
	const list = cloudTrpc.channelMessage.list.useInfiniteQuery(
		{ channelId },
		{ getNextPageParam: (page) => page.nextCursor ?? undefined },
	);
	const root = useMemo(
		() =>
			currentUserId
				? postedRoot(list.data?.pages.flatMap((page) => page.messages) ?? [], {
						authorId: currentUserId,
						text,
						at: postedAt,
					})
				: null,
		[list.data, currentUserId, text, postedAt],
	);
	const rootId = root && isSaved(root) ? root.id : null;
	const fresh = Date.now() - postedAt < POSTED_WINDOW_MS;
	const thread = cloudTrpc.channelMessage.thread.useQuery(
		{ messageId: rootId ?? "" },
		{
			enabled: rootId !== null,
			retry: false,
			refetchInterval: (query) => {
				const replies = query.state.data?.replies ?? [];
				const waiting = devIds.some(
					(devId) => !replies.some((reply) => reply.authorId === devId),
				);
				return fresh && waiting ? THREAD_POLL_MS : false;
			},
		},
	);
	if (!root) return null;
	const replies = (thread.data?.replies ?? []).filter(
		(reply) => reply.deletedAt === null,
	);
	const openThread = rootId
		? () => pushPage(channelId, { kind: "thread", id: rootId })
		: undefined;
	const hidden = replies.length - SHOWN_REPLIES;
	return (
		<div className="mt-1.5 flex flex-col gap-2.5 border-l-2 border-border pl-3 empty:hidden">
			{replies.slice(-SHOWN_REPLIES).map((reply) => (
				<DevReply
					key={reply.id}
					message={reply}
					peopleById={peopleById}
					devsById={devsById}
					currentUserId={currentUserId}
				/>
			))}
			{devIds.map((devId) => (
				<DevPickup
					key={devId}
					devId={devId}
					face={devsById.get(devId)}
					rootId={rootId}
					postedAt={postedAt}
					replies={replies}
					onOpenThread={openThread}
				/>
			))}
			{openThread && replies.length > 0 && (
				<button
					type="button"
					onClick={openThread}
					className="self-start text-[12px] font-medium text-link hover:underline"
				>
					{hidden > 0
						? t({ message: `See all ${replies.length} replies` })
						: t({ message: "Reply in thread" })}
				</button>
			)}
		</div>
	);
}
