import { Plural, Trans, useLingui } from "@lingui/react/macro";
import {
	chatDevs,
	directDev,
	lastEditableMessage,
	type Message,
	mentionCandidates,
	messageCopyText,
	messagesOf,
	renderMentions,
	tasksOf,
	typingLabel,
} from "@superset/chats-core";
import { chatTurns } from "@superset/chats-sync";
import { toast } from "@superset/ui/sonner";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import { LuChevronRight, LuPlug, LuSquareCheck } from "react-icons/lu";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";
import { useNow } from "renderer/hooks/useNow";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { PageHeader } from "renderer/routes/_authenticated/_dashboard/components/PageHeader";
import { StateScreenShell } from "renderer/routes/_authenticated/_dashboard/components/StateScreenShell";
import { ChatFace } from "../../../components/ChatFace";
import { DevPluginIcons } from "../../../components/DevPluginIcons";
import { DevPluginsDialog } from "../../../components/DevPluginsDialog";
import { useChats } from "../../../hooks/useChats";
import {
	type Preview,
	WorkspacePreviewProvider,
} from "../../providers/WorkspacePreviewProvider";
import { ChatComposer } from "../ChatComposer";
import { ChatDetailsPanel } from "../ChatDetailsPanel";
import { ChatThread } from "../ChatThread";
import { MessageDetailsPanel } from "../MessageDetailsPanel";
import type { MessageActions } from "../MessageItem";
import { NewTaskDialog } from "../NewTaskDialog";
import { PagePanel } from "../PagePanel";
import { TaskPanel } from "../TaskPanel";
import { WorkspaceChatPanel } from "../WorkspaceChatPanel";

/** What is open beside the thread; one thing at a time. */
type Panel =
	| { kind: "details" }
	| { kind: "message"; id: string }
	| { kind: "workspace"; id: string }
	| { kind: "page"; slug: string }
	| { kind: "task"; id: string };

const NOW_TICK_MS = 30_000;
const HIGHLIGHT_MS = 1600;
const TASK_TITLE_MAX = 120;

/** One chat: its header pill, the conversation, the composer, and the details beside it. */
interface ChatScreenProps {
	chatId: string;
	/** The task whose panel is open when the chat opens. */
	initialTaskId?: string;
}

export function ChatScreen({ chatId, initialTaskId }: ChatScreenProps) {
	const { t } = useLingui();
	const chats = useChats();
	const now = useNow(NOW_TICK_MS);
	const { copyToClipboard } = useCopyToClipboard();
	const [replyTo, setReplyTo] = useState<Message | null>(null);
	const [editing, setEditing] = useState<Message | null>(null);
	const [panel, setPanel] = useState<Panel | null>(
		initialTaskId ? { kind: "task", id: initialTaskId } : null,
	);
	const [showsPlugins, setShowsPlugins] = useState(false);
	const [newTask, setNewTask] = useState<{
		title: string;
		description: string;
	} | null>(null);
	const preview = useMemo<Preview>(
		() => ({
			openWorkspace: (id) => setPanel({ kind: "workspace", id }),
			openPage: (slug) => setPanel({ kind: "page", slug }),
		}),
		[],
	);
	const [highlightedId, setHighlightedId] = useState<string | null>(null);

	const state = chats?.state ?? null;
	const live = chats?.live;
	const dispatch = chats?.dispatch;
	const chat = state?.chats.find((candidate) => candidate.id === chatId);
	const watchChat = chats?.watchChat;
	useEffect(() => {
		watchChat?.(chatId);
		return () => watchChat?.(null);
	}, [watchChat, chatId]);

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

	useEffect(() => () => live?.typing.reporter.stopped(chatId), [live, chatId]);

	const stateRef = useRef(state);
	stateRef.current = state;

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
			copy: (message) => {
				const current = stateRef.current;
				void copyToClipboard(
					current ? messageCopyText(current, message) : message.text,
				);
			},
			remove: (message) =>
				dispatch?.({ type: "delete-message", messageId: message.id }),
			answerQuestion: (questionId, answer, typed) =>
				dispatch?.({ type: "answer-question", questionId, answer, typed }),
			answerForm: (questionId, answers) =>
				dispatch?.({ type: "answer-form", questionId, answers }),
			details: (message) => setPanel({ kind: "message", id: message.id }),
			turnIntoTask: (message) => {
				const current = stateRef.current;
				const text = (
					current ? messageCopyText(current, message) : message.text
				).trim();
				const [first = "", ...rest] = text.split("\n");
				const long = first.length > TASK_TITLE_MAX;
				setNewTask({
					title: long
						? `${first.slice(0, TASK_TITLE_MAX - 1).trimEnd()}…`
						: first,
					description: long ? text : rest.join("\n").trim(),
				});
			},
			openTask: (id) => setPanel({ kind: "task", id }),
			toggleTask: (taskId) => dispatch?.({ type: "toggle-task", taskId }),
			retry: (message) =>
				message.file
					? live?.files.retry(message.id)
					: dispatch?.({ type: "retry-send", messageId: message.id }),
			discard: (message) =>
				message.file
					? live?.files.discard(message.id)
					: dispatch?.({ type: "discard-send", messageId: message.id }),
			jumpTo,
			fileLink: async (fileId) => {
				if (!live) throw new Error("Chats are not loaded");
				return (await live.fileLink(fileId)).url;
			},
			openFile: (file) => {
				void live
					?.fileLink(file.id)
					.then((link) => electronTrpcClient.external.openUrl.mutate(link.url))
					.catch(() => toast.error(t({ message: "Couldn't open the file" })));
			},
		}),
		[dispatch, live, copyToClipboard, jumpTo, t],
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

	/** Each file goes as its own message; the text is the first one's caption. */
	const sendFiles = (text: string, files: File[]) => {
		files.forEach((file, index) => {
			const localUri = file.type.startsWith("image/")
				? URL.createObjectURL(file)
				: undefined;
			live?.files.send({
				chatId,
				name: file.name,
				size: file.size,
				caption: index === 0 ? text : undefined,
				localUri,
				read: async () => ({
					sha256: "",
					readPart: async (_part, start, end) =>
						new Uint8Array(await file.slice(start, end).arrayBuffer()),
				}),
				onDone: () => {
					if (localUri) URL.revokeObjectURL(localUri);
				},
			});
		});
	};

	const agent = directDev(state, chat);
	const title = agent?.name ?? chat.title;
	const nameOf = (ref: { kind: "dev" | "user"; id: string }) =>
		(ref.kind === "dev"
			? state.devs[ref.id]?.name
			: state.members[ref.id]?.name) ?? "";
	const replyName = replyTo
		? ((replyTo.authorDevId
				? state.devs[replyTo.authorDevId]?.name
				: replyTo.authorId
					? state.members[replyTo.authorId]?.name
					: undefined) ?? t({ message: "Unknown" }))
		: "";
	const typing = typingLabel(state, chatId, typists);
	const candidates = mentionCandidates(state, chat);
	const devs = chatDevs(state, chat);
	const groupDevName =
		chat.kind === "group"
			? devs.find((dev) => dev.kind === "group")?.name
			: undefined;
	const working = chatTurns(chats.turns, chatId, devs);
	const direct = chat.kind === "direct" ? directDev(state, chat) : undefined;
	const ownDev = direct?.plugins !== undefined ? direct : undefined;
	const ownDevPlugins = ownDev
		? [...(ownDev.paradevAccess ? ["paradev"] : []), ...(ownDev.plugins ?? [])]
		: [];
	const detailedMessage =
		panel?.kind === "message"
			? messagesOf(state, chatId).find((message) => message.id === panel.id)
			: undefined;
	const openTask =
		panel?.kind === "task"
			? state.tasks.find((task) => task.id === panel.id)
			: undefined;
	const close = () => setPanel(null);
	const openTaskCount = tasksOf(state, chatId).filter(
		(task) => task.status !== "done",
	).length;

	return (
		<div className="flex h-full w-full min-w-0 flex-1 overflow-hidden">
			<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
				<PageHeader>
					<div className="drag h-full flex-1 basis-0" />
					<button
						type="button"
						aria-label={t({ message: "Chat details" })}
						aria-expanded={panel?.kind === "details"}
						onClick={() =>
							setPanel((shown) =>
								shown?.kind === "details" ? null : { kind: "details" },
							)
						}
						className="flex h-8 min-w-0 shrink items-center gap-2 rounded-lg px-1.5 hover:bg-fill-hover aria-expanded:bg-fill-hover"
					>
						<ChatFace chat={chat} size={22} />
						<span className="truncate text-sm font-medium tracking-[-0.01em]">
							{title}
						</span>
						<LuChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
					</button>
					<div className="drag flex h-full flex-1 basis-0 items-center justify-end gap-1 pr-2">
						<button
							type="button"
							onClick={() =>
								openTaskCount === 0
									? setNewTask({ title: "", description: "" })
									: setPanel({ kind: "details" })
							}
							className="no-drag flex h-8 shrink-0 whitespace-nowrap items-center gap-1.5 rounded-lg px-2 text-muted-foreground text-sm hover:bg-fill-hover hover:text-foreground"
						>
							<LuSquareCheck className="size-3.5 shrink-0" />
							{openTaskCount === 0 ? (
								<Trans>New task</Trans>
							) : (
								<Plural value={openTaskCount} one="# task" other="# tasks" />
							)}
						</button>
						{ownDev && (
							<button
								type="button"
								onClick={() => setShowsPlugins(true)}
								className="no-drag flex h-8 items-center gap-2 rounded-lg px-2 text-muted-foreground text-sm hover:bg-fill-hover hover:text-foreground"
							>
								<LuPlug className="size-3.5" />
								{ownDevPlugins.length === 0 ? (
									<Trans>Add plugins</Trans>
								) : (
									<DevPluginIcons plugins={ownDevPlugins} />
								)}
							</button>
						)}
					</div>
				</PageHeader>
				<WorkspacePreviewProvider value={preview}>
					<ChatThread
						state={state}
						chatId={chatId}
						isGroup={chat.kind === "group"}
						now={now}
						highlightedId={highlightedId}
						actions={actions}
						onLoadOlder={loadOlder}
						working={working}
						live={chats.turns}
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
				</WorkspacePreviewProvider>
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
						placeholder={
							groupDevName
								? t({
										message: `Message ${title}, or @${groupDevName} to ask its Dev`,
									})
								: t({ message: `Message ${title}` })
						}
						candidates={candidates}
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
						onTextChange={(text) => live?.typing.reporter.changed(chatId, text)}
						onSend={(text, files) => {
							live?.typing.reporter.stopped(chatId);
							if (files.length > 0) {
								sendFiles(text, files);
							} else if (editing) {
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
						onNewTask={() => setNewTask({ title: "", description: "" })}
						onEditLast={() => {
							const last = lastEditableMessage(state, chatId);
							if (last) setEditing(last);
						}}
					/>
				</div>
			</div>
			{panel?.kind === "workspace" && (
				<WorkspaceChatPanel
					key={panel.id}
					workspaceId={panel.id}
					onClose={close}
				/>
			)}
			{showsPlugins && ownDev && (
				<DevPluginsDialog
					dev={ownDev}
					onOpenChange={setShowsPlugins}
					onSave={(patch) => chats.actions.updateDev(ownDev.id, patch)}
				/>
			)}
			{panel?.kind === "page" && (
				<PagePanel slug={panel.slug} onClose={close} />
			)}
			{detailedMessage && live && (
				<MessageDetailsPanel
					state={state}
					message={detailedMessage}
					load={live.messageDetails}
					onClose={close}
				/>
			)}
			{openTask && live && (
				<TaskPanel
					key={openTask.id}
					state={state}
					task={openTask}
					taskActions={chats.taskActions}
					subscribe={live.subscribe}
					live={chats.turns}
					now={now}
					onClose={close}
				/>
			)}
			{panel?.kind === "details" && (
				<ChatDetailsPanel
					state={state}
					chat={chat}
					title={title}
					onClose={close}
					onOpenTask={(id) => setPanel({ kind: "task", id })}
					onNewTask={() => setNewTask({ title: "", description: "" })}
				/>
			)}
			{newTask && (
				<NewTaskDialog
					state={state}
					chat={chat}
					now={now}
					initial={newTask}
					onOpenChange={(open) => !open && setNewTask(null)}
					onCreate={(form) => chats.taskActions.create(chatId, form)}
					onCreated={(id) => setPanel({ kind: "task", id })}
				/>
			)}
		</div>
	);
}

const NOBODY: readonly string[] = [];
const noSubscription = () => () => {};
