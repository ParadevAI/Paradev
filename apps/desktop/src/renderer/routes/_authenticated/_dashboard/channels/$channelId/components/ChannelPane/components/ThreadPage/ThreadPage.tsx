import { Plural, Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { useChannelReadState } from "renderer/routes/_authenticated/hooks/useChannelReadState";
import { unreadState } from "../../../../utils/unreadState";
import { ChannelComposer } from "../../../ChannelComposer";
import type { ChannelPerson } from "../../../MessageBody";
import { NewMessagesLine } from "../../../NewMessagesLine";
import { ThreadMessage, useDevFaces } from "../../../ThreadMessage";

const MARK_READ_DELAY_MS = 350;

interface ThreadPageProps {
	channelId: string;
	messageId: string;
	peopleById: Map<string, ChannelPerson>;
	people: ChannelPerson[];
	currentUserId: string | null;
	canPost: boolean;
}

/** A note and its replies, as a conversation: the note on top, replies under a rule, a reply box below. */
export function ThreadPage({
	channelId,
	messageId,
	peopleById,
	people,
	currentUserId,
	canPost,
}: ThreadPageProps) {
	const { t } = useLingui();
	const { data, isPending, isError, isFetching } =
		cloudTrpc.channelMessage.thread.useQuery({ messageId }, { retry: false });
	const devsById = useDevFaces();
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
	const follow = cloudTrpc.channelThread.follow.useMutation({
		onSuccess: (state) => applyThreadRead(messageId, state),
		onError,
	});
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
	const lineBefore =
		ghost === null || ghost === undefined || !data
			? null
			: (unreadState(data.replies, ghost, currentUserId).firstUnread?.id ??
				null);

	const markReadMutate = markRead.mutate;
	const pendingSeq = unread?.latestSeq ?? null;
	const canMark =
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
	const following = followState?.following ?? false;
	return (
		<div className="flex min-h-0 flex-1 flex-col">
			<div className="min-h-0 flex-1 overflow-y-auto pb-2">
				<div className="pt-2">
					<ThreadMessage
						message={data.root}
						peopleById={peopleById}
						devsById={devsById}
						currentUserId={currentUserId}
						continued={false}
					/>
				</div>
				<div className="my-2 flex items-center gap-2 px-4 text-[11px] text-muted-foreground">
					<span>
						<Plural
							value={data.replies.length}
							_0="No replies yet"
							one="# reply"
							other="# replies"
						/>
					</span>
					<div className="h-px flex-1 bg-border" />
					<button
						type="button"
						onClick={() =>
							follow.mutate({ rootId: messageId, following: !following })
						}
						className="rounded px-1.5 py-0.5 font-medium text-muted-foreground transition-colors hover:bg-fill-hover hover:text-foreground"
					>
						{following ? <Trans>Following</Trans> : <Trans>Follow</Trans>}
					</button>
				</div>
				{data.replies.map((reply, index) => {
					const previous = data.replies[index - 1];
					const isFirstNew = reply.id === lineBefore;
					return (
						<div key={reply.id}>
							{isFirstNew && <NewMessagesLine />}
							<ThreadMessage
								message={reply}
								peopleById={peopleById}
								devsById={devsById}
								currentUserId={currentUserId}
								continued={!isFirstNew && previous?.authorId === reply.authorId}
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
						compact
					/>
				</div>
			)}
		</div>
	);
}
