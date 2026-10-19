import { useLingui } from "@lingui/react/macro";
import type { Pane, Tab, WorkspaceStore } from "@superset/panes";
import { toast } from "@superset/ui/sonner";
import { useCallback, useEffect, useRef, useState } from "react";
import { useUndoStack } from "renderer/stores/undo-stack";
import type { StoreApi } from "zustand/vanilla";
import type { ChatPaneData, PaneViewerData } from "../../../../types";
import {
	isChatSessionClosed,
	markChatSessionClosed,
} from "../../../../utils/closedChatSessions";
import {
	addPendingChatStop,
	readPendingChatStops,
	removePendingChatStop,
} from "../../../../utils/pendingChatStops";
import { useChatWiring } from "../../components/ChatSession/hooks/useSessionClient";
import { ChatClosedToast } from "./components/ChatClosedToast";
import { createClosedChatBatches } from "./utils/closedChatBatches";

const UNDO_WINDOW_MS = 10_000;

interface ClosedChat {
	pane: Pane<PaneViewerData>;
	slot: { tab: Tab<PaneViewerData>; index: number } | null;
	sessionId: string;
	title: string;
	reopen: () => void;
}

export function useUndoableChatClose({
	workspaceId,
	store,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
}): (pane: Pane<PaneViewerData>) => void {
	const { t } = useLingui();
	const wiring = useChatWiring();
	const stopChat = useCallback(
		async (sessionId: string) => {
			const reopen = markChatSessionClosed(sessionId);
			try {
				await wiring.transport.closeSession({ sessionId });
				return true;
			} catch (error) {
				console.warn("[acp-chat] could not stop the chat session", error);
				reopen();
				return false;
			}
		},
		[wiring.transport],
	);
	const latest = useRef({ store, stopChat, t });
	latest.current = { store, stopChat, t };
	const previousTabs = useRef(store.getState().tabs);

	useEffect(
		() =>
			store.subscribe((_state, previous) => {
				previousTabs.current = previous.tabs;
			}),
		[store],
	);

	const [batches] = useState(() => {
		const stopSession = (sessionId: string) => {
			if (!isChatSessionClosed(sessionId)) return;
			void latest.current
				.stopChat(sessionId)
				.then((stopped) => {
					if (!stopped) {
						toast.error(
							latest.current.t({ message: "Couldn't stop the chat" }),
						);
					}
				})
				.finally(() => removePendingChatStop(sessionId));
		};
		const { push, remove } = useUndoStack.getState();
		const closed = createClosedChatBatches<ClosedChat>({
			show: ({ id, chats }) => {
				push({ id, undo: () => closed.undo(id) });
				toast.custom(
					() => (
						<ChatClosedToast
							durationMs={UNDO_WINDOW_MS}
							onUndo={() => closed.undo(id)}
							titles={chats.map((chat) => chat.title)}
						/>
					),
					{
						id,
						duration: UNDO_WINDOW_MS,
						onAutoClose: () => {
							remove(id);
							closed.expire(id);
						},
						onDismiss: () => {
							remove(id);
							closed.expire(id);
						},
					},
				);
			},
			hide: (id) => {
				remove(id);
				toast.dismiss(id);
			},
			restore: (chat) => {
				if (!isChatSessionClosed(chat.sessionId)) return;
				removePendingChatStop(chat.sessionId);
				chat.reopen();
				const state = latest.current.store.getState();
				if (chat.slot) state.insertTab(chat.slot);
				else state.addTab({ panes: [chat.pane] });
			},
			stop: (chat) => stopSession(chat.sessionId),
		});
		return { closed, stopSession };
	});

	useEffect(() => {
		for (const sessionId of readPendingChatStops(workspaceId)) {
			batches.stopSession(sessionId);
		}
	}, [workspaceId, batches]);

	useEffect(() => () => batches.closed.flush(), [batches]);

	return useCallback(
		(pane) => {
			const data = pane.data as ChatPaneData;
			const { sessionId } = data;
			if (!sessionId || isChatSessionClosed(sessionId)) return;
			const index = previousTabs.current.findIndex(
				(tab) => tab.panes[pane.id] !== undefined,
			);
			const tab = previousTabs.current[index];
			addPendingChatStop(workspaceId, sessionId);
			batches.closed.add({
				pane,
				slot:
					tab && Object.keys(tab.panes).length === 1 ? { tab, index } : null,
				sessionId,
				title: pane.titleOverride ?? data.chatTitle ?? t({ message: "Chat" }),
				reopen: markChatSessionClosed(sessionId),
			});
		},
		[batches, workspaceId, t],
	);
}
