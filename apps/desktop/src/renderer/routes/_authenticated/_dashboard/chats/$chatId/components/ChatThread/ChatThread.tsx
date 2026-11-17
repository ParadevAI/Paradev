import {
	type ChatState,
	messagesOf,
	toThreadItems,
} from "@superset/chats-core";
import type { LiveTurn, LiveTurns } from "@superset/chats-sync";
import { olderMessagesOf } from "@superset/chats-sync";
import {
	type ReactNode,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
} from "react";
import { LuLoader } from "react-icons/lu";
import { type MessageActions, MessageItem } from "../MessageItem";
import { ThreadTime } from "../ThreadTime";
import { WorkingRow } from "./components/WorkingRow";

const NEAR_BOTTOM_PX = 120;

interface ChatThreadProps {
	state: ChatState;
	chatId: string;
	isGroup: boolean;
	now: Date;
	highlightedId: string | null;
	actions: MessageActions;
	onLoadOlder: () => void;
	/** Shown above the oldest message once the whole history is loaded. */
	intro: ReactNode;
	/** Devs at work in this chat, shown after the newest message. */
	working: LiveTurn[];
	/** Every Dev's turn in flight, for the turns nested in the ones shown. */
	live: LiveTurns;
}

/**
 * A chat's messages in a centred column, newest at the bottom. It stays at
 * the bottom while the reader is there, and keeps their place when older
 * messages load in above.
 */
export function ChatThread({
	state,
	chatId,
	isGroup,
	now,
	highlightedId,
	actions,
	onLoadOlder,
	intro,
	working,
	live,
}: ChatThreadProps) {
	const messages = useMemo(() => messagesOf(state, chatId), [state, chatId]);
	const items = useMemo(() => toThreadItems(messages), [messages]);
	const older = olderMessagesOf(state, chatId);
	const scrollerRef = useRef<HTMLDivElement>(null);
	const sentinelRef = useRef<HTMLDivElement>(null);
	const nearBottom = useRef(true);
	const anchor = useRef<{ firstId: string; height: number } | null>(null);
	const firstId = messages[0]?.id;
	const lastId = messages.at(-1)?.id;
	const streamed = working.reduce(
		(size, turn) =>
			size +
			turn.stream.blocks.reduce(
				(sum, block) => sum + 1 + ("text" in block ? block.text.length : 0),
				0,
			),
		0,
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: runs when the ends of the list change
	useLayoutEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;
		const before = anchor.current;
		if (
			before &&
			firstId &&
			before.firstId !== firstId &&
			!nearBottom.current
		) {
			scroller.scrollTop += scroller.scrollHeight - before.height;
		} else if (nearBottom.current) {
			scroller.scrollTop = scroller.scrollHeight;
		}
		anchor.current = firstId
			? { firstId, height: scroller.scrollHeight }
			: null;
	}, [firstId, lastId, working.length, streamed]);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		const scroller = scrollerRef.current;
		if (!sentinel || !scroller || !older.hasMore) return;
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) onLoadOlder();
			},
			{ root: scroller, rootMargin: "200px 0px 0px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [older.hasMore, onLoadOlder]);

	return (
		<div
			ref={scrollerRef}
			onScroll={(event) => {
				const el = event.currentTarget;
				nearBottom.current =
					el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
			}}
			className="min-h-0 flex-1 overflow-y-auto pb-3"
		>
			<div className="mx-auto w-full max-w-[720px]">
				{older.hasMore ? (
					<div
						ref={sentinelRef}
						className="flex justify-center py-3 text-muted-foreground"
					>
						{older.loading && <LuLoader className="size-4 animate-spin" />}
					</div>
				) : (
					intro
				)}
				{items.map((item) => {
					if (item.kind === "day" || item.kind === "time") {
						return (
							<ThreadTime
								key={item.key}
								at={item.at}
								now={now}
								showsDay={item.kind === "day"}
							/>
						);
					}
					if (item.kind !== "message") return null;
					return (
						<MessageItem
							key={item.key}
							state={state}
							message={item.message}
							first={item.first}
							last={item.last}
							isGroup={isGroup}
							isHighlighted={item.message.id === highlightedId}
							actions={actions}
						/>
					);
				})}
				{working.map((turn) => (
					<WorkingRow
						key={turn.devId}
						state={state}
						live={live}
						turn={turn}
						isGroup={isGroup}
					/>
				))}
			</div>
		</div>
	);
}
