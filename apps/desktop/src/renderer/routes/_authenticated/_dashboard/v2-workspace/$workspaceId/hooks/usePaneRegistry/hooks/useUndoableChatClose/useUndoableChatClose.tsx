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
	markChatTerminalClosed,
	reopenChatTerminal,
} from "../../../../utils/closedChatSessions";
import {
	addPendingChatStop,
	readPendingChatStops,
	removePendingChatStop,
} from "../../../../utils/pendingChatStops";
import { useChatWiring } from "../../components/ChatSession/hooks/useSessionClient";
import { useChatSubagentStore } from "../../stores/chatSubagentStore";
import { ChatClosedToast } from "./components/ChatClosedToast";
import { createClosedChatBatches } from "./utils/closedChatBatches";
import { findStrayChatSessions } from "./utils/findStrayChatSessions";

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
	linkedStores,
}: {
	workspaceId: string;
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	linkedStores?: readonly StoreApi<WorkspaceStore<PaneViewerData>>[];
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
	const stopStrayChats = useCallback(
		async (terminalId: string, closedSessionId: string | null) => {
			const sessions = await wiring.transport
				.listSessions({ workspaceId })
				.catch((error: unknown) => {
					console.warn("[acp-chat] could not list chats to stop", error);
					return [];
				});
			const kept = new Set<string>([
				...readPendingChatStops(workspaceId),
				...(closedSessionId ? [closedSessionId] : []),
			]);
			for (const paneStore of [store, ...(linkedStores ?? [])]) {
				for (const tab of paneStore.getState().tabs) {
					for (const pane of Object.values(tab.panes)) {
						const { sessionId } = pane.data as Partial<ChatPaneData>;
						if (pane.kind === "chat-v3" && sessionId) kept.add(sessionId);
					}
				}
			}
			for (const stray of findStrayChatSessions(sessions, terminalId, kept)) {
				markChatSessionClosed(stray.sessionId);
				void wiring.transport
					.closeSession({ sessionId: stray.sessionId })
					.catch((error: unknown) =>
						console.warn("[acp-chat] could not stop a stray chat", error),
					);
			}
		},
		[wiring.transport, workspaceId, store, linkedStores],
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
		const stopSession = (sessionId: string, terminalId?: string) => {
			if (!isChatSessionClosed(sessionId)) return;
			void latest.current
				.stopChat(sessionId)
				.then((stopped) => {
					if (!stopped) {
						if (terminalId) reopenChatTerminal(terminalId);
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
			stop: (chat) => {
				const { terminalId } = chat.pane.data as ChatPaneData;
				stopSession(chat.sessionId, terminalId);
				useChatSubagentStore.getState().forget(terminalId);
			},
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
			const { sessionId, terminalId } = data;
			const reopenTerminal = markChatTerminalClosed(terminalId);
			void stopStrayChats(terminalId, sessionId);
			if (!sessionId || isChatSessionClosed(sessionId)) return;
			const index = previousTabs.current.findIndex(
				(tab) => tab.panes[pane.id] !== undefined,
			);
			const tab = previousTabs.current[index];
			addPendingChatStop(workspaceId, sessionId);
			const reopenSession = markChatSessionClosed(sessionId);
			batches.closed.add({
				pane,
				slot:
					tab && Object.keys(tab.panes).length === 1 ? { tab, index } : null,
				sessionId,
				title: pane.titleOverride ?? data.chatTitle ?? t({ message: "Chat" }),
				reopen: () => {
					reopenSession();
					reopenTerminal();
				},
			});
		},
		[batches, workspaceId, t, stopStrayChats],
	);
}
