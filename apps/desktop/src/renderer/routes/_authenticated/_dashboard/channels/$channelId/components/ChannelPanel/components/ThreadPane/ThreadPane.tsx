import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useChannelReadState } from "renderer/routes/_authenticated/hooks/useChannelReadState";
import { unreadState } from "../../../../utils/unreadState";
import { ChannelComposer } from "../../../ChannelComposer";
import {
	ChannelMessageRow,
	type ChannelPerson,
} from "../../../ChannelMessageRow";
import { NewMessagesLine } from "../../../NewMessagesLine";

const MARK_READ_DELAY_MS = 350;

interface ThreadPaneProps {
	channelId: string;
	messageId: string;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canModerate: boolean;
	canPost: boolean;
	now: Date;
}

export function ThreadPane({
	channelId,
	messageId,
	peopleById,
	people,
	currentUserId,
	canModerate,
	canPost,
	now,
}: ThreadPaneProps) {
	const { t } = useLingui();
	const { data, isPending, isError, isFetching } =
		cloudTrpc.channelMessage.thread.useQuery({ messageId }, { retry: false });
	const { applyThreadRead } = useChannelReadState();
	const utils = cloudTrpc.useUtils();
	const resyncThread = () => {
		void utils.channelMessage.thread.invalidate({ messageId });
		void utils.channelThread.list.invalidate();
	};
	const onError = (error: unknown) =>
		toast.error(
			errorMessage(error, t({ message: "Couldn't save the change" })),
		);
	const markRead = cloudTrpc.channelThread.markRead.useMutation({
		onSuccess: (follow) => follow && applyThreadRead(messageId, follow),
		onError: resyncThread,
	});
	const markUnread = cloudTrpc.channelThread.markUnread.useMutation({
		onSuccess: (follow) => applyThreadRead(messageId, follow),
		onError: (error) => {
			setManualUnread(false);
			resyncThread();
			onError(error);
		},
	});
	const follow = cloudTrpc.channelThread.follow.useMutation({
		onSuccess: (state) => applyThreadRead(messageId, state),
		onError,
	});
	const [manualUnread, setManualUnread] = useState(false);
	/** The read point when the thread opened; the "New" line stays here. */
	const [ghost, setGhost] = useState<number | null | undefined>(undefined);
	const followState = data?.follow ?? null;
	const unread =
		data && followState?.following
			? unreadState(data.replies, followState.lastReadSeq, currentUserId)
			: null;
	if (ghost === undefined && data && !isFetching) {
		setGhost(
			unread?.firstUnread && followState ? followState.lastReadSeq : null,
		);
	}
	const lineSeq = manualUnread ? (followState?.lastReadSeq ?? null) : ghost;
	const lineBefore =
		lineSeq === null || lineSeq === undefined || !data
			? null
			: (unreadState(data.replies, lineSeq, currentUserId).firstUnread?.id ??
				null);

	const markReadMutate = markRead.mutate;
	const pendingSeq = unread?.latestSeq ?? null;
	const canMark =
		!manualUnread &&
		followState?.following === true &&
		pendingSeq !== null &&
		pendingSeq > followState.lastReadSeq;
	const markNow = useCallback(() => {
		if (!canMark || pendingSeq === null || !document.hasFocus()) return;
		applyThreadRead(messageId, { lastReadSeq: pendingSeq, following: true });
		markReadMutate({ rootId: messageId, seq: pendingSeq });
	}, [canMark, pendingSeq, messageId, applyThreadRead, markReadMutate]);
	const markNowRef = useRef(markNow);
	markNowRef.current = markNow;
	useEffect(() => {
		if (!canMark) return;
		const timer = setTimeout(() => markNowRef.current(), MARK_READ_DELAY_MS);
		return () => clearTimeout(timer);
	}, [canMark]);
	useEffect(() => {
		const onFocus = () => markNowRef.current();
		window.addEventListener("focus", onFocus);
		return () => window.removeEventListener("focus", onFocus);
	}, []);

	const markAllRead = () => {
		setGhost(null);
		setManualUnread(false);
		if (followState?.following) {
			markReadMutate({ rootId: messageId }, { onError });
		}
	};
	if (isPending) {
		return (
			<div className="flex flex-1 items-center justify-center text-muted-foreground">
				<LuLoader className="size-4 animate-spin" />
			</div>
		);
	}
	if (isError || !data) {
		return (
			<p className="p-4 text-sm text-muted-foreground">
				<Trans>Message not found</Trans>
			</p>
		);
	}
	const authorOf = (id: string | null) =>
		id ? (peopleById.get(id) ?? null) : null;
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: Esc marks the thread read from anywhere inside it
		<div
			className="flex min-h-0 flex-1 flex-col"
			onKeyDown={(event) => {
				if (
					event.key !== "Escape" ||
					event.shiftKey ||
					event.repeat ||
					event.defaultPrevented ||
					document.querySelector('[role="dialog"], [role="menu"]')
				) {
					return;
				}
				markAllRead();
			}}
		>
			<div className="min-h-0 flex-1 overflow-y-auto pb-2">
				<ChannelMessageRow
					message={data.root}
					author={authorOf(data.root.authorId)}
					compact={false}
					now={now}
					currentUserId={currentUserId}
					canModerate={canModerate}
					canReact={canPost}
					peopleById={peopleById}
					follow={{
						following: followState?.following ?? false,
						onToggle: () =>
							follow.mutate({
								rootId: messageId,
								following: !followState?.following,
							}),
					}}
				/>
				{data.replies.length > 0 && (
					<div className="my-2 flex items-center gap-2 px-4 text-[11px] text-muted-foreground">
						<span>
							<Plural
								value={data.replies.length}
								one="# reply"
								other="# replies"
							/>
						</span>
						<div className="h-px flex-1 bg-border" />
					</div>
				)}
				{data.replies.map((reply, index) => {
					const previous = data.replies[index - 1];
					const isFirstNew = reply.id === lineBefore;
					return (
						<div key={reply.id}>
							{isFirstNew && <NewMessagesLine />}
							<ChannelMessageRow
								message={reply}
								author={authorOf(reply.authorId)}
								compact={!isFirstNew && previous?.authorId === reply.authorId}
								now={now}
								currentUserId={currentUserId}
								canModerate={canModerate}
								canReact={canPost}
								peopleById={peopleById}
								onMarkUnread={() => {
									setGhost(null);
									setManualUnread(true);
									markUnread.mutate({ messageId: reply.id });
								}}
							/>
						</div>
					);
				})}
			</div>
			{canPost && currentUserId && (
				<div className="shrink-0 p-3">
					<ChannelComposer
						key={messageId}
						channelId={channelId}
						threadRootId={messageId}
						people={people}
						currentUserId={currentUserId}
						placeholder={t({ message: "Reply…" })}
						autoFocus
					/>
				</div>
			)}
		</div>
	);
}
