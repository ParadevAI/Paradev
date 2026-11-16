import { Trans, useLingui } from "@lingui/react/macro";
import {
	directDev,
	lastEditableMessage,
	type Message,
	renderMentions,
	typingLabel,
} from "@superset/chats-core";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { LuChevronRight } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useNow } from "renderer/hooks/useNow";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { ChatFace } from "../../../components/ChatFace";
import { useChats } from "../../../hooks/useChats";
import { ChatComposer } from "../ChatComposer";
import { ChatDetailsPanel } from "../ChatDetailsPanel";
import { ChatThread } from "../ChatThread";
import type { MessageActions } from "../MessageItem";

const NOW_TICK_MS = 30_000;
const HIGHLIGHT_MS = 1600;

/** One chat: its header pill, the conversation, the composer, and the details beside it. */
export function ChatScreen({ chatId }: { chatId: string }) {
	const { t } = useLingui();
	const chats = useChats();
	const now = useNow(NOW_TICK_MS);
	const { copyToClipboard } = useCopyToClipboard();
	const [replyTo, setReplyTo] = useState<Message | null>(null);
	const [editing, setEditing] = useState<Message | null>(null);
	const [showsDetails, setShowsDetails] = useState(false);
	const [highlightedId, setHighlightedId] = useState<string | null>(null);

	const state = chats?.state ?? null;
	const live = chats?.live;
	const dispatch = chats?.dispatch;
	const chat = state?.chats.find((candidate) => candidate.id === chatId);

	useEffect(() => {
		if (!live) return;
		const view = () =>
			live.reads.view({ active: document.hasFocus(), groupId: chatId });
		view();
		window.addEventListener("focus", view);
		window.addEventListener("blur", view);
		return () => {
			window.removeEventListener("focus", view);
			window.removeEventListener("blur", view);
			live.reads.view({ active: false, groupId: null });
		};
	}, [live, chatId]);

	const typists = useSyncExternalStore(
		live?.typing.watch.subscribe ?? noSubscription,
		() => live?.typing.watch.typists(chatId) ?? NOBODY,
	);

	const jumpTo = useCallback((messageId: string) => {
		document
			.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`)
			?.scrollIntoView({ block: "center" });
		setHighlightedId(messageId);
		setTimeout(() => setHighlightedId(null), HIGHLIGHT_MS);
	}, []);

	const actions = useMemo<MessageActions>(
		() => ({
			reply: (message) => {
				setEditing(null);
				setReplyTo(message);
			},
			edit: (message) => {
				setReplyTo(null);
				setEditing(message);
			},
			copy: (message) => void copyToClipboard(message.text),
			remove: (message) =>
				dispatch?.({ type: "delete-message", messageId: message.id }),
			retry: (message) =>
				dispatch?.({ type: "retry-send", messageId: message.id }),
			discard: (message) =>
				dispatch?.({ type: "discard-send", messageId: message.id }),
			jumpTo,
		}),
		[dispatch, copyToClipboard, jumpTo],
	);

	const loadOlder = useCallback(
		() => void live?.loadOlderMessages(chatId),
		[live, chatId],
	);

	if (!chats || !state) return <StateScreenShell />;
	if (!chat) {
		return (
			<StateScreenShell>
				<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
					<Trans>Chat not found</Trans>
				</div>
			</StateScreenShell>
		);
	}

	const agent = directDev(state, chat);
	const title = agent?.name ?? chat.title;
	const nameOf = (ref: { kind: "dev" | "user"; id: string }) =>
		`@${(ref.kind === "dev" ? state.devs[ref.id]?.name : state.members[ref.id]?.name) ?? ""}`;
	const replyName = replyTo
		? ((replyTo.authorDevId
				? state.devs[replyTo.authorDevId]?.name
				: replyTo.authorId
					? state.members[replyTo.authorId]?.name
					: undefined) ?? t({ message: "Unknown" }))
		: "";
	const typing = typingLabel(state, chatId, typists);

	return (
		<div className="flex h-full w-full min-w-0 flex-1 overflow-hidden">
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<PageHeader>
					<div className="drag h-full flex-1 basis-0" />
					<button
						type="button"
						aria-label={t({ message: "Chat details" })}
						aria-expanded={showsDetails}
						onClick={() => setShowsDetails((shown) => !shown)}
						className="flex h-8 min-w-0 shrink items-center gap-2 rounded-lg px-1.5 hover:bg-fill-hover aria-expanded:bg-fill-hover"
					>
						<ChatFace chat={chat} size={22} />
						<span className="truncate text-sm font-medium tracking-[-0.01em]">
							{title}
						</span>
						<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
					</button>
					<div className="drag h-full flex-1 basis-0" />
				</PageHeader>
				<ChatThread
					state={state}
					chatId={chatId}
					isGroup={chat.kind === "group"}
					now={now}
					highlightedId={highlightedId}
					actions={actions}
					onLoadOlder={loadOlder}
					intro={
						<div className="flex flex-col items-center gap-2 px-8 pt-12 pb-4 text-center">
							<ChatFace chat={chat} size={60} />
							<h2 className="max-w-full truncate text-[22px] leading-tight font-semibold tracking-[-0.02em]">
								{title}
							</h2>
							{agent?.description && (
								<p className="max-w-md text-sm text-muted-foreground">
									{agent.description}
								</p>
							)}
						</div>
					}
				/>
				<div className="relative mx-auto w-full max-w-[720px] shrink-0 px-4 pb-4">
					{typing && (
						<div
							aria-live="polite"
							className="pointer-events-none absolute bottom-full left-6 mb-1 rounded-lg bg-popover px-1.5 py-0.5 text-xs text-muted-foreground shadow-sm"
						>
							{typing}
						</div>
					)}
					<ChatComposer
						placeholder={t({ message: `Message ${title}` })}
						replyingTo={
							replyTo
								? {
										name: replyName,
										text: renderMentions(replyTo.text, nameOf),
									}
								: null
						}
						editing={editing ? { text: editing.text } : null}
						onCancel={() => {
							setReplyTo(null);
							setEditing(null);
						}}
						onSend={(text) => {
							if (editing) {
								dispatch?.({
									type: "edit-message",
									messageId: editing.id,
									text,
								});
							} else {
								dispatch?.({
									type: "send",
									chatId,
									text,
									replyToId: replyTo?.id,
								});
							}
							setReplyTo(null);
							setEditing(null);
						}}
						onEditLast={() => {
							const last = lastEditableMessage(state, chatId);
							if (last) setEditing(last);
						}}
					/>
				</div>
			</div>
			{showsDetails && (
				<ChatDetailsPanel
					state={state}
					chat={chat}
					title={title}
					onClose={() => setShowsDetails(false)}
				/>
			)}
		</div>
	);
}

const NOBODY: readonly string[] = [];
const noSubscription = () => () => {};
