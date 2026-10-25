import { Trans } from "@lingui/react/macro";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";
import { ChannelMessageRow, type ChannelPerson } from "../ChannelMessageRow";
import { DayDivider } from "./components/DayDivider";
import { NewMessagesLine } from "./components/NewMessagesLine";
import { groupMessages } from "./utils/groupMessages";

const NEAR_BOTTOM_PX = 120;

interface ChannelTimelineProps {
	channelId: string;
	channelName: string;
	lastReadSeq: number | null;
	peopleById: Map<string, ChannelPerson>;
	currentUserId: string | null;
	canModerate: boolean;
	now: Date;
	onOpenThread: (message: ChannelMessage) => void;
	onLatestChange: () => void;
}

export function ChannelTimeline({
	channelId,
	channelName,
	lastReadSeq,
	peopleById,
	currentUserId,
	canModerate,
	now,
	onOpenThread,
	onLatestChange,
}: ChannelTimelineProps) {
	const query = cloudTrpc.channelMessage.list.useInfiniteQuery(
		{ channelId },
		{ getNextPageParam: (page) => page.nextCursor ?? undefined },
	);
	const messages = useMemo(
		() =>
			(query.data?.pages ?? [])
				.slice()
				.reverse()
				.flatMap((page) => page.messages),
		[query.data],
	);
	const entries = useMemo(
		() => groupMessages(messages, lastReadSeq, currentUserId),
		[messages, lastReadSeq, currentUserId],
	);

	const scrollerRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const nearBottom = useRef(true);
	const anchor = useRef<{ firstId: string; height: number } | null>(null);
	const firstId = messages[0]?.id;
	const lastId = messages.at(-1)?.id;

	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller || !lastId) return;
		const previous = anchor.current;
		if (previous && previous.firstId !== firstId && !nearBottom.current) {
			scroller.scrollTop += scroller.scrollHeight - previous.height;
		} else if (nearBottom.current) {
			scroller.scrollTop = scroller.scrollHeight;
		}
		anchor.current = firstId
			? { firstId, height: scroller.scrollHeight }
			: null;
	}, [firstId, lastId]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the newest message changes
	useEffect(() => {
		if (lastId) onLatestChange();
	}, [lastId]);

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
	useEffect(() => {
		const sentinel = sentinelRef.current;
		const scroller = scrollerRef.current;
		if (!sentinel || !scroller || !hasNextPage) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting && !isFetchingNextPage) {
					anchor.current = firstId
						? { firstId, height: scroller.scrollHeight }
						: null;
					void fetchNextPage();
				}
			},
			{ root: scroller, rootMargin: "200px 0px 0px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage, firstId]);

	return (
		<div
			ref={scrollerRef}
			onScroll={(event) => {
				const el = event.currentTarget;
				nearBottom.current =
					el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
			}}
			className="min-h-0 flex-1 overflow-y-auto pb-2"
		>
			{hasNextPage ? (
				<div
					ref={sentinelRef}
					className="flex justify-center py-3 text-muted-foreground"
				>
					{isFetchingNextPage && <LuLoader className="size-4 animate-spin" />}
				</div>
			) : (
				query.data && (
					<div className="px-4 pt-8 pb-4">
						<h2 className="text-lg font-semibold">#{channelName}</h2>
						<p className="text-sm text-muted-foreground">
							<Trans>This is the start of #{channelName}.</Trans>
						</p>
					</div>
				)
			)}
			{entries.map((entry) => {
				if (entry.kind === "day") {
					return <DayDivider key={entry.key} date={entry.date} />;
				}
				if (entry.kind === "new") return <NewMessagesLine key={entry.key} />;
				const { message } = entry;
				return (
					<ChannelMessageRow
						key={entry.key}
						message={message}
						author={
							message.authorUserId
								? (peopleById.get(message.authorUserId) ?? null)
								: null
						}
						compact={entry.compact}
						now={now}
						currentUserId={currentUserId}
						canModerate={canModerate}
						onOpenThread={onOpenThread}
					/>
				);
			})}
		</div>
	);
}
