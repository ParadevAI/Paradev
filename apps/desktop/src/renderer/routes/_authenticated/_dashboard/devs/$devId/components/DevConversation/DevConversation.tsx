import { Trans, useLingui } from "@lingui/react/macro";
import type { RouterOutputs } from "@superset/trpc";
import { cn } from "@superset/ui/utils";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { DecisionRow } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/DecisionRow";
import {
	type ChannelPerson,
	MessageBody,
} from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/MessageBody";
import { PersonAvatar } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/components/PersonAvatar";
import { useSendChannelText } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/hooks/useSendChannelText";
import { decisionOptions } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/utils/decisionCards";
import { messageTime } from "renderer/routes/_authenticated/_dashboard/channels/$channelId/utils/messageTime";
import { DevAvatar } from "renderer/routes/_authenticated/_dashboard/components/DevAvatar";
import { useChannelReadState } from "renderer/routes/_authenticated/hooks/useChannelReadState";
import type { ChannelMessage } from "renderer/routes/_authenticated/utils/channelMessageCache";

type Dev = RouterOutputs["agent"]["get"];

const GROUP_GAP_MS = 5 * 60_000;
const NEAR_BOTTOM_PX = 160;

interface DevConversationProps {
	channelId: string;
	dev: Dev;
	peopleById: Map<string, ChannelPerson>;
	currentUserId: string | null;
	/** Shown above the first message, once everything older is loaded. */
	intro: ReactNode;
}

interface MessageGroup {
	key: string;
	authorId: string | null;
	messages: ChannelMessage[];
}

/** Consecutive messages from one author, close in time, read as one. */
function groupMessages(messages: readonly ChannelMessage[]): MessageGroup[] {
	const groups: MessageGroup[] = [];
	for (const message of messages) {
		const last = groups.at(-1);
		const previous = last?.messages.at(-1);
		if (
			last &&
			previous &&
			!message.subtype &&
			!previous.subtype &&
			last.authorId === message.authorId &&
			message.createdAt.getTime() - previous.createdAt.getTime() < GROUP_GAP_MS
		) {
			last.messages.push(message);
			continue;
		}
		groups.push({
			key: message.id,
			authorId: message.authorId,
			messages: [message],
		});
	}
	return groups;
}

/**
 * A Dev's direct messages as a conversation: the person's words on the
 * right, the Dev's on the left with its face, nothing else in the way.
 */
export function DevConversation({
	channelId,
	dev,
	peopleById,
	currentUserId,
	intro,
}: DevConversationProps) {
	const { t } = useLingui();
	const query = cloudTrpc.channelMessage.list.useInfiniteQuery(
		{ channelId },
		{ getNextPageParam: (page) => page.nextCursor ?? undefined },
	);
	const messages = useMemo(
		() =>
			(query.data?.pages ?? [])
				.slice()
				.reverse()
				.flatMap((page) => page.messages)
				.filter((message) => message.deletedAt === null),
		[query.data],
	);
	const groups = useMemo(() => groupMessages(messages), [messages]);
	const newest = messages.at(-1);
	const asked = useMemo(
		() =>
			newest && newest.authorId === dev.id && !newest.subtype
				? decisionOptions(newest.body)
				: [],
		[newest, dev.id],
	);
	const sendText = useSendChannelText(channelId, currentUserId);

	const { applyChannelRead } = useChannelReadState();
	const markRead = cloudTrpc.channel.markRead.useMutation({
		onSuccess: (state) => applyChannelRead(channelId, state),
	});
	const markReadMutate = markRead.mutate;
	const newestSeq = newest?.seq;
	useEffect(() => {
		if (newestSeq === undefined || !document.hasFocus()) return;
		markReadMutate({ channelId });
	}, [channelId, newestSeq, markReadMutate]);

	const scrollerRef = useRef<HTMLDivElement>(null);
	const nearBottom = useRef(true);
	const onScroll = () => {
		const element = scrollerRef.current;
		if (!element) return;
		nearBottom.current =
			element.scrollHeight - element.scrollTop - element.clientHeight <
			NEAR_BOTTOM_PX;
	};
	const newestId = newest?.id;
	// biome-ignore lint/correctness/useExhaustiveDependencies: the newest message is what moves the view, not the whole list
	useLayoutEffect(() => {
		const element = scrollerRef.current;
		if (element && nearBottom.current) element.scrollTop = element.scrollHeight;
	}, [newestId]);

	const row = (group: MessageGroup) => {
		const first = group.messages[0];
		if (!first) return null;
		if (first.subtype) {
			return (
				<p
					key={group.key}
					className="py-1 text-center text-[12px] text-muted-foreground"
				>
					{first.subtype === "channel_join" ? (
						<Trans>Joined</Trans>
					) : (
						<Trans>Left</Trans>
					)}
				</p>
			);
		}
		const own = group.authorId !== null && group.authorId === currentUserId;
		const fromDev = group.authorId === dev.id;
		const person = group.authorId ? peopleById.get(group.authorId) : null;
		const time = messageTime(first.createdAt);
		if (own) {
			return (
				<div key={group.key} className="flex flex-col items-end gap-1 py-1.5">
					{group.messages.map((message) => (
						<div
							key={message.id}
							className="max-w-[85%] rounded-[18px] bg-fill-hover px-4 py-2"
						>
							<MessageBody
								message={message}
								peopleById={peopleById}
								currentUserId={currentUserId}
								className="text-[14px] leading-[1.5]"
							/>
						</div>
					))}
					<span className="pr-1 text-[11px] text-muted-foreground tabular-nums">
						{time}
					</span>
				</div>
			);
		}
		return (
			<div key={group.key} className="flex gap-3 py-1.5">
				<span className="mt-0.5 shrink-0">
					{fromDev ? (
						<DevAvatar avatar={dev.avatar} size={28} />
					) : (
						<PersonAvatar
							name={person?.name ?? t({ message: "Unknown" })}
							image={person?.image ?? null}
							className="size-7 text-[11px]"
						/>
					)}
				</span>
				<div className="flex min-w-0 flex-1 flex-col gap-1">
					<span className="flex items-baseline gap-2">
						<span className="text-[13px] font-semibold">
							{fromDev ? dev.name : (person?.name ?? t({ message: "Unknown" }))}
						</span>
						<span className="text-[11px] text-muted-foreground tabular-nums">
							{time}
						</span>
					</span>
					{group.messages.map((message) => (
						<MessageBody
							key={message.id}
							message={message}
							peopleById={peopleById}
							currentUserId={currentUserId}
							className="text-[14px] leading-[1.5]"
						/>
					))}
				</div>
			</div>
		);
	};

	return (
		<div
			ref={scrollerRef}
			onScroll={onScroll}
			className={cn("min-h-0 flex-1 overflow-y-auto")}
		>
			<div className="mx-auto flex w-full max-w-[720px] flex-col px-4 pb-4">
				{query.hasNextPage ? (
					<button
						type="button"
						disabled={query.isFetchingNextPage}
						onClick={() => void query.fetchNextPage()}
						className="mx-auto my-3 h-8 rounded-md px-3 text-[13px] text-muted-foreground hover:bg-fill-hover hover:text-foreground"
					>
						<Trans>Show older</Trans>
					</button>
				) : query.isPending ? (
					<div className="flex justify-center py-10 text-muted-foreground">
						<LuLoader className="size-4 animate-spin" />
					</div>
				) : (
					intro
				)}
				{groups.map(row)}
				{asked.length > 0 && (
					<DecisionRow
						key={newest?.id}
						options={asked}
						className="pt-1 pb-2 pl-10"
						onAnswer={(option) => sendText(option)}
					/>
				)}
			</div>
		</div>
	);
}
