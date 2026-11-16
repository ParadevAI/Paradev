import { useLingui } from "@lingui/react/macro";
import { chatRows } from "@superset/chats-core";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { useMatchRoute } from "renderer/hooks/useMatchRoute";
import { useNow } from "renderer/hooks/useNow";
import { useChats } from "../../hooks/useChats";
import { ChatListRow } from "./components/ChatListRow";
import { ChatsSection } from "./components/ChatsSection";
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

	const rows = (list: typeof agents) =>
		list.map((row) => (
			<ChatListRow
				key={row.chat.id}
				row={row}
				now={now}
				isActive={row.chat.id === activeChatId}
				isWorking={false}
				onOpen={open}
			/>
		));

	return (
		<>
			<ChatsSection
				label={t({ message: "Devs" })}
				addLabel={t({ message: "New Dev" })}
				onAdd={() => setDialog("agent")}
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
			<NewGroupDialog
				open={dialog === "group"}
				onOpenChange={(next) => setDialog(next ? "group" : null)}
				onCreate={(title) =>
					chats.actions.createGroup({
						title,
						devName: title,
						devColor: DEFAULT_COLOR,
					})
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
			/>
		</>
	);
}
