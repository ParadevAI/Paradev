import type { RouterOutputs } from "@superset/trpc";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { LuLoader } from "react-icons/lu";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	type ChannelMessage,
	PENDING_SEQ,
} from "renderer/routes/_authenticated/utils/channelMessageCache";
import { useOrgDevs } from "../../hooks/useOrgDevs";
import { countsAsUnread, unreadState } from "../../utils/unreadState";
import { ChannelMessageRow, type ChannelPerson } from "../ChannelMessageRow";
import { NewMessagesLine } from "../NewMessagesLine";
import { ChannelIntro } from "./components/ChannelIntro";
import { DayDivider } from "./components/DayDivider";
import { UnreadBanner } from "./components/UnreadBanner";
import { groupMessages } from "./utils/groupMessages";
import { type JumpOption, jumpTarget, startOfDay } from "./utils/jumpTarget";

const NEAR_BOTTOM_PX = 120;
const LINE_OFFSET_PX = 64;
const SCROLL_SEEN_DEBOUNCE_MS = 350;
const MAX_PAGES_TO_UNREAD = 10;
const MAX_PAGES_TO_JUMP = 40;

type Jump = { kind: "date"; target: Date | null } | { kind: "unread" };

interface ChannelTimelineProps {
	channelId: string;
	channel: RouterOutputs["channel"]["get"];
	onAddPeople?: () => void;
	onEditDescription?: () => void;
	onRename?: () => void;
	/**
	 * Where the "New" line is drawn; stays put while the read point moves.
	 * Undefined until the read point is fresh, which holds the first scroll.
	 */
	lineSeq: number | null | undefined;
	/** The member's read point; null when not a member. */
	lastReadSeq: number | null;
	canAutoMark: boolean;
	/** The first unread message is on screen in a focused window. */
	onSeen: (seq: number, saveGhost: boolean) => void;
	onMarkAllRead: () => void;
	/** Nothing was unread on open, so later messages get no "New" line. */
	onOpenedRead: () => void;
	onMarkUnread?: (message: ChannelMessage) => void;
	peopleById: Map<string, ChannelPerson>;
	currentUserId: string | null;
	canModerate: boolean;
	canReact: boolean;
	now: Date;
	onOpenThread?: (message: ChannelMessage) => void;
	intro?: ReactNode;
	focusMessageId: string | null;
	onFocusedMessage: () => void;
}

export function ChannelTimeline({
	channelId,
	channel,
	onAddPeople,
	onEditDescription,
	onRename,
	lineSeq,
	lastReadSeq,
	canAutoMark,
	onSeen,
	onMarkAllRead,
	onOpenedRead,
	onMarkUnread,
	peopleById,
	currentUserId,
	canModerate,
	canReact,
	now,
	onOpenThread,
	intro,
	focusMessageId,
	onFocusedMessage,
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
	const devs = useOrgDevs();
	const entries = useMemo(() => {
		const devIds = new Set((devs ?? []).map((dev) => dev.id));
		return groupMessages(messages, lineSeq ?? null, currentUserId, (id) =>
			devIds.has(id),
		);
	}, [messages, lineSeq, currentUserId, devs]);
	const unread = useMemo(
		() =>
			lastReadSeq === null
				? null
				: unreadState(messages, lastReadSeq, currentUserId),
		[messages, lastReadSeq, currentUserId],
	);

	const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
	const scrollerRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const nearBottom = useRef(true);
	const anchor = useRef<{ firstId: string; height: number } | null>(null);
	const positioned = useRef(false);
	/** Keeps the "New" line in place while images above it load, until the reader scrolls. */
	const pinnedToLine = useRef(false);
	const initialLine = useRef<number | null | undefined>(undefined);
	const sentSeq = useRef<number | null>(null);
	const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [bannerVisible, setBannerVisible] = useState(false);
	const firstId = messages[0]?.id;
	const lastId = messages.at(-1)?.id;

	const live = useRef({ unread, lastReadSeq, canAutoMark, onSeen });
	live.current = { unread, lastReadSeq, canAutoMark, onSeen };

	useEffect(() => {
		if (lastReadSeq !== null) sentSeq.current = null;
	}, [lastReadSeq]);

	const scrollToLine = (scroller: HTMLDivElement) => {
		const line = scroller.querySelector("[data-new-line]");
		if (!line) return;
		scroller.scrollTop +=
			line.getBoundingClientRect().top -
			scroller.getBoundingClientRect().top -
			LINE_OFFSET_PX;
	};

	const check = useCallback((saveGhost: boolean) => {
		const scroller = scrollerRef.current;
		const { unread, lastReadSeq, canAutoMark, onSeen } = live.current;
		if (
			!scroller ||
			!unread ||
			lastReadSeq === null ||
			!positioned.current ||
			scroller.clientWidth === 0
		) {
			return;
		}
		const first = unread.firstUnread
			? scroller.querySelector(
					`[data-message-id="${CSS.escape(unread.firstUnread.id)}"]`,
				)
			: null;
		const seen =
			!unread.firstUnread ||
			(first !== null &&
				first.getBoundingClientRect().top <
					scroller.getBoundingClientRect().bottom);
		setBannerVisible(!seen);
		const seq = unread.latestSeq;
		if (
			!seen ||
			!canAutoMark ||
			!document.hasFocus() ||
			seq === null ||
			seq <= lastReadSeq ||
			sentSeq.current === seq
		) {
			return;
		}
		sentSeq.current = seq;
		onSeen(seq, saveGhost && unread.firstUnread !== null);
	}, []);

	// Start where the reader left off: at the "New" line, loading older pages
	// until it is in, or at the bottom when there is nothing new.
	// biome-ignore lint/correctness/useExhaustiveDependencies: runs as pages arrive until placed
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (
			positioned.current ||
			!scroller ||
			!query.data ||
			lineSeq === undefined
		) {
			return;
		}
		if (initialLine.current === undefined) initialLine.current = lineSeq;
		const line = initialLine.current;
		const showsLine =
			line !== null &&
			messages.some(
				(message) =>
					message.seq > line &&
					message.seq !== PENDING_SEQ &&
					countsAsUnread(message, currentUserId),
			);
		const oldest = messages[0];
		if (
			showsLine &&
			oldest &&
			oldest.seq > line + 1 &&
			hasNextPage &&
			!query.isFetchNextPageError &&
			query.data.pages.length < MAX_PAGES_TO_UNREAD
		) {
			if (!isFetchingNextPage) void fetchNextPage();
			return;
		}
		positioned.current = true;
		if (!showsLine) onOpenedRead();
		const lineElement = showsLine
			? scroller.querySelector("[data-new-line]")
			: null;
		if (lineElement) {
			pinnedToLine.current = true;
			scrollToLine(scroller);
		} else {
			scroller.scrollTop = scroller.scrollHeight;
		}
		nearBottom.current =
			scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight <
			NEAR_BOTTOM_PX;
		anchor.current = firstId
			? { firstId, height: scroller.scrollHeight }
			: null;
	}, [
		messages,
		query.data,
		hasNextPage,
		isFetchingNextPage,
		query.isFetchNextPageError,
		lineSeq,
	]);

	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller || !lastId || !positioned.current) return;
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

	// biome-ignore lint/correctness/useExhaustiveDependencies: re-checks when the newest message or read point changes
	useEffect(() => {
		const frame = requestAnimationFrame(() => check(false));
		return () => cancelAnimationFrame(frame);
	}, [lastId, lastReadSeq, canAutoMark, unread?.firstUnread?.id, check]);

	useEffect(() => {
		const onFocus = () => check(true);
		window.addEventListener("focus", onFocus);
		return () => {
			window.removeEventListener("focus", onFocus);
			if (scrollTimer.current) clearTimeout(scrollTimer.current);
		};
	}, [check]);

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

	// biome-ignore lint/correctness/useExhaustiveDependencies: retries as messages load until placed
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (!focusMessageId || !scroller || !positioned.current) return;
		const element = scroller.querySelector(
			`[data-message-id="${CSS.escape(focusMessageId)}"]`,
		);
		if (element) {
			pinnedToLine.current = false;
			element.scrollIntoView({ block: "center" });
		}
		onFocusedMessage();
	}, [focusMessageId, messages, onFocusedMessage]);

	const [jump, setJump] = useState<Jump | null>(null);
	const isJumping = useRef(false);
	const jumpTo = async (target: Date | null) => {
		if (isJumping.current) return;
		isJumping.current = true;
		try {
			let oldest = messages[0]?.createdAt;
			let more = hasNextPage;
			let pages = query.data?.pages.length ?? 0;
			while (
				more &&
				pages < MAX_PAGES_TO_JUMP &&
				(!target || !oldest || oldest > target)
			) {
				const result = await fetchNextPage();
				if (result.isError) break;
				const loaded = result.data?.pages ?? [];
				oldest = loaded.at(-1)?.messages[0]?.createdAt ?? oldest;
				pages = loaded.length;
				more = result.hasNextPage;
			}
			setJump({ kind: "date", target });
		} finally {
			isJumping.current = false;
		}
	};

	const jumpToUnread = async () => {
		if (isJumping.current) return;
		isJumping.current = true;
		try {
			await loadToUnread();
		} finally {
			isJumping.current = false;
		}
		setJump({ kind: "unread" });
	};

	const loadToUnread = async () => {
		const readPoint = live.current.lastReadSeq ?? 0;
		let oldest = messages[0]?.seq;
		let more = hasNextPage;
		let pages = query.data?.pages.length ?? 0;
		while (
			more &&
			oldest !== undefined &&
			oldest > readPoint + 1 &&
			pages < MAX_PAGES_TO_UNREAD
		) {
			const result = await fetchNextPage();
			if (result.isError) break;
			const loaded = result.data?.pages ?? [];
			oldest = loaded.at(-1)?.messages[0]?.seq ?? oldest;
			pages = loaded.length;
			more = result.hasNextPage;
		}
	};

	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (!jump || !scroller) return;
		setJump(null);
		if (jump.kind === "unread") {
			const id = live.current.unread?.firstUnread?.id;
			const element = id
				? scroller.querySelector(`[data-message-id="${CSS.escape(id)}"]`)
				: null;
			if (element) {
				scroller.scrollTop +=
					element.getBoundingClientRect().top -
					scroller.getBoundingClientRect().top -
					LINE_OFFSET_PX;
			}
			check(true);
			return;
		}
		if (!jump.target) {
			scroller.scrollTop = 0;
			return;
		}
		const time = jump.target.getTime();
		const day = [...scroller.querySelectorAll<HTMLElement>("[data-day]")].find(
			(element) => Number(element.dataset.day) >= time,
		);
		if (day) {
			scroller.scrollTop +=
				day.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
		} else {
			scroller.scrollTop = scroller.scrollHeight;
		}
	}, [jump, check]);

	return (
		<div className="relative flex min-h-0 flex-1 flex-col">
			{bannerVisible && unread && (
				<UnreadBanner
					count={
						hasNextPage && (messages[0]?.seq ?? 0) > (lastReadSeq ?? 0) + 1
							? null
							: unread.unreadCount
					}
					onJump={() => void jumpToUnread()}
					onMarkRead={onMarkAllRead}
				/>
			)}
			<div
				ref={scrollerRef}
				onLoadCapture={(event) => {
					// An image that loads after layout grows its message; keep the view where it was placed.
					if (pinnedToLine.current) {
						scrollToLine(event.currentTarget);
					} else if (nearBottom.current) {
						event.currentTarget.scrollTop = event.currentTarget.scrollHeight;
					}
				}}
				onWheel={() => {
					pinnedToLine.current = false;
				}}
				onPointerDown={() => {
					pinnedToLine.current = false;
				}}
				onScroll={(event) => {
					const el = event.currentTarget;
					nearBottom.current =
						el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
					if (scrollTimer.current) clearTimeout(scrollTimer.current);
					scrollTimer.current = setTimeout(
						() => check(true),
						SCROLL_SEEN_DEBOUNCE_MS,
					);
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
					query.data &&
					(intro ?? (
						<ChannelIntro
							channel={channel}
							creator={
								channel.createdByUserId
									? (peopleById.get(channel.createdByUserId) ?? null)
									: null
							}
							isCreator={channel.createdByUserId === currentUserId}
							onAddPeople={onAddPeople}
							onEditDescription={onEditDescription}
							onRename={onRename}
						/>
					))
				)}
				{entries.map((entry) => {
					if (entry.kind === "day") {
						return (
							<DayDivider
								key={entry.key}
								date={startOfDay(entry.date)}
								onJump={(option: JumpOption) =>
									void jumpTo(jumpTarget(option, now))
								}
								onJumpToDate={(date) => void jumpTo(startOfDay(date))}
							/>
						);
					}
					if (entry.kind === "new") return <NewMessagesLine key={entry.key} />;
					const { message } = entry;
					return (
						<ChannelMessageRow
							key={entry.key}
							message={message}
							author={
								message.authorId
									? (peopleById.get(message.authorId) ?? null)
									: null
							}
							compact={entry.compact}
							rollup={entry.rollup}
							now={now}
							currentUserId={currentUserId}
							canModerate={canModerate}
							canReact={canReact}
							peopleById={peopleById}
							onOpenThread={onOpenThread}
							onMarkUnread={
								onMarkUnread && message.seq !== PENDING_SEQ
									? () => onMarkUnread(message)
									: undefined
							}
						/>
					);
				})}
			</div>
		</div>
	);
}
