import { Trans, useLingui } from "@lingui/react/macro";
import { chatRows, directDev } from "@superset/chats-core";
import { workingGroupIds } from "@superset/chats-sync";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { LuSquareCheck } from "react-icons/lu";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";
import { useNow } from "renderer/hooks/useNow";
import { FaceAvatar } from "renderer/routes/_authenticated/_dashboard/components/FaceAvatar";
import { useChats } from "../../hooks/useChats";
import { listingFace } from "../../utils/listingFace";
import { ChatListRow } from "./components/ChatListRow";
import { ChatsSection } from "./components/ChatsSection";
import { DeleteChatDialog } from "./components/DeleteChatDialog";
import { NewDevDialog } from "./components/NewDevDialog";
import { NewGroupDialog } from "./components/NewGroupDialog";

const NOW_TICK_MS = 60_000;
const DEFAULT_COLOR = "#F2B23E";

/** The chat lists: 1:1s with Devs first, then groups, each by latest message. */
export function ChatsSidebar() {
	const { t } = useLingui();
	const chats = useChats();
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const now = useNow(NOW_TICK_MS);
	const [dialog, setDialog] = useState<"group" | "agent" | null>(null);
	const [deletingId, setDeletingId] = useState<string | null>(null);
	const state = chats?.state ?? null;
	const agents = useMemo(() => (state ? chatRows(state, "devs") : []), [state]);
	const groups = useMemo(
		() => (state ? chatRows(state, "groups") : []),
		[state],
	);
	const active = matchRoute({ to: "/chats/$chatId", fuzzy: true });
	const activeChatId = active ? active.chatId : null;
	const open = useCallback(
		(chatId: string) =>
			void navigate({ to: "/chats/$chatId", params: { chatId } }),
		[navigate],
	);
	if (!chats || !state) return null;

	const working = workingGroupIds(chats.turns);
	const deleting = state.chats.find((chat) => chat.id === deletingId) ?? null;
	const deleteLabelOf = (chat: (typeof state.chats)[number]) => {
		if (chat.kind === "group") {
			return chat.ownerIds.includes(state.meId)
				? t({ message: "Delete group" })
				: null;
		}
		const dev = directDev(state, chat);
		return dev?.kind === "custom" && dev.ownerId === state.meId
			? t({ message: "Delete Dev" })
			: null;
	};
	const confirmDelete = async () => {
		if (!deleting) return;
		setDeletingId(null);
		const dev = deleting.kind === "direct" ? directDev(state, deleting) : null;
		const deleted = dev
			? await chats.actions.deleteAgent(dev.id)
			: await chats.actions.deleteGroup(deleting.id);
		if (deleted && deleting.id === activeChatId)
			void navigate({ to: "/chats" });
	};

	const rows = (list: typeof agents) =>
		list.map((row) => (
			<ChatListRow
				key={row.chat.id}
				row={row}
				now={now}
				isActive={row.chat.id === activeChatId}
				isWorking={working.has(row.chat.id)}
				onOpen={open}
				deleteLabel={deleteLabelOf(row.chat)}
				onDelete={setDeletingId}
			/>
		));

	const openTasks = state.tasks.filter((task) => task.status !== "done").length;
	const onTasks = Boolean(matchRoute({ to: "/chats/tasks" }));

	return (
		<>
			<div className="px-2 pt-1">
				<button
					type="button"
					aria-current={onTasks ? "page" : undefined}
					onClick={() => void navigate({ to: "/chats/tasks" })}
					className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-fill-hover aria-[current=page]:bg-fill-selected"
				>
					<LuSquareCheck className="size-4 text-muted-foreground" />
					<span className="flex-1 text-left">
						<Trans>All tasks</Trans>
					</span>
					{openTasks > 0 && (
						<span className="text-muted-foreground text-xs tabular-nums">
							{openTasks}
						</span>
					)}
				</button>
			</div>
			<ChatsSection
				label={t({ message: "Devs" })}
				addLabel={t({ message: "New Dev" })}
				onAdd={() => setDialog("agent")}
				more={[
					{
						label: t({ message: "Browse Devs…" }),
						icon: <FaceAvatar face={listingFace("eng-lead")} size={16} />,
						onSelect: () => void navigate({ to: "/chats/devs" }),
					},
				]}
				empty={t({ message: "No Devs yet" })}
			>
				{rows(agents)}
			</ChatsSection>
			<ChatsSection
				label={t({ message: "Groups" })}
				addLabel={t({ message: "New group" })}
				onAdd={() => setDialog("group")}
				empty={t({ message: "No groups yet" })}
			>
				{rows(groups)}
			</ChatsSection>
			<DeleteChatDialog
				chat={
					deleting
						? {
								title:
									deleting.kind === "direct"
										? (directDev(state, deleting)?.name ?? deleting.title)
										: deleting.title,
								kind: deleting.kind,
							}
						: null
				}
				onCancel={() => setDeletingId(null)}
				onConfirm={() => void confirmDelete()}
			/>
			<NewGroupDialog
				open={dialog === "group"}
				onOpenChange={(next) => setDialog(next ? "group" : null)}
				onCreate={(group) =>
					chats.actions.createGroup({ ...group, devColor: DEFAULT_COLOR })
				}
				onCreated={open}
			/>
			<NewDevDialog
				open={dialog === "agent"}
				onOpenChange={(next) => setDialog(next ? "agent" : null)}
				onCreate={(dev) =>
					chats.actions.createAgent({ ...dev, color: DEFAULT_COLOR })
				}
				onCreated={open}
				onBrowse={() => void navigate({ to: "/chats/devs" })}
			/>
		</>
	);
}
