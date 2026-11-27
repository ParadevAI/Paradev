import { presetForAcpHarness } from "@superset/chat/core";
import type { WorkspaceState, WorkspaceStore } from "@superset/panes";
import { getTerminalBackgroundMarkerIdsKey } from "renderer/lib/terminal/terminal-background-intents";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../../../types";
import { parseAttachedTerminalIdsKey } from "../../../../utils/backgroundTerminals";
import { isTerminalReplacementCancelled } from "../../../../utils/cancelledTerminalReplacements";
import {
	isChatSessionClosed,
	isChatSessionReopened,
	isChatTerminalIgnored,
} from "../../../../utils/closedChatSessions";
import {
	readPendingChatStops,
	readPendingChatStopTerminalIds,
} from "../../../../utils/pendingChatStops";
import type { ListedChatSession } from "../chatConversations";
import {
	type AgentTabHiding,
	type ListedTerminalSession,
	type ReconcileAgentTabsInput,
	reconcileAgentTabs,
} from "../reconcileAgentTabs";

export type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;

export interface WorkspacePaneStores {
	main: PaneStore;
	linked: readonly PaneStore[];
}

type HostAnswer =
	| { kind: "awaited" }
	| { kind: "showedStored"; sessionIds: ReadonlySet<string> }
	| { kind: "listed" };

export interface AgentTabSync {
	openedEmpty: boolean | null;
	host: HostAnswer;
}

export interface HostLists {
	chats?: readonly ListedChatSession[];
	terminals?: readonly ListedTerminalSession[];
}

interface ReadArgs<T> {
	stores: WorkspacePaneStores;
	workspaceId: string;
	signal: AbortSignal;
	read: () => Promise<T>;
}

export function createAgentTabSync(): AgentTabSync {
	return { openedEmpty: null, host: { kind: "awaited" } };
}

export async function showStoredChats(
	sync: AgentTabSync,
	{ stores, workspaceId, signal, read }: ReadArgs<readonly ListedChatSession[]>,
): Promise<void> {
	noteWorkspaceOpened(sync, stores);
	const chats = await read();
	if (signal.aborted || sync.host.kind !== "awaited") return;
	if (sync.openedEmpty !== true) {
		sync.host = { kind: "showedStored", sessionIds: new Set() };
		return;
	}
	apply(
		stores,
		reconcileAgentTabs({ ...baseInput(stores, workspaceId, true), chats }),
	);
	sync.host = {
		kind: "showedStored",
		sessionIds: new Set(chats.map((chat) => chat.sessionId)),
	};
}

export async function syncWithHost<Lists extends HostLists>(
	sync: AgentTabSync,
	{ stores, workspaceId, signal, read }: ReadArgs<Lists>,
): Promise<{ changed: boolean; lists: Lists }> {
	noteWorkspaceOpened(sync, stores);
	const lists = await read();
	const { chats, terminals } = lists;
	if (signal.aborted || (!chats && !terminals)) {
		return { changed: false, lists };
	}
	const stored =
		sync.host.kind === "showedStored" ? sync.host.sessionIds : null;
	const result = reconcileAgentTabs({
		...baseInput(stores, workspaceId, sync.openedEmpty === true),
		chats,
		terminals,
		...(chats && stored?.size ? { shownFromStoredChats: stored } : {}),
	});
	if (chats) {
		sync.host = { kind: "listed" };
		if (chats.length > 0) sync.openedEmpty = false;
	}
	apply(stores, result);
	return { changed: result.changed, lists };
}

function noteWorkspaceOpened(
	sync: AgentTabSync,
	stores: WorkspacePaneStores,
): void {
	sync.openedEmpty ??= [stores.main, ...stores.linked].every(
		(store) => store.getState().tabs.length === 0,
	);
}

function baseInput(
	stores: WorkspacePaneStores,
	workspaceId: string,
	openedEmpty: boolean,
): ReconcileAgentTabsInput {
	return {
		main: layoutOf(stores.main),
		linked: stores.linked.map(layoutOf),
		presetFor: presetForAcpHarness,
		hiding: hidingIn(workspaceId),
		openedEmpty,
	};
}

function hidingIn(workspaceId: string): AgentTabHiding {
	const stoppingSessions = new Set(readPendingChatStops(workspaceId));
	const stoppingTerminals = new Set(
		readPendingChatStopTerminalIds(workspaceId),
	);
	const backgrounded = new Set(
		parseAttachedTerminalIdsKey(getTerminalBackgroundMarkerIdsKey(workspaceId)),
	);
	return {
		isChatClosedHere: (sessionId) =>
			isChatSessionClosed(sessionId) || stoppingSessions.has(sessionId),
		isChatTerminalHidden: (terminalId) =>
			isChatTerminalIgnored(terminalId) || stoppingTerminals.has(terminalId),
		isTerminalHidden: (terminalId) =>
			backgrounded.has(terminalId) ||
			isTerminalReplacementCancelled(terminalId),
		isChatReopenedHere: isChatSessionReopened,
	};
}

function layoutOf(store: PaneStore): WorkspaceState<PaneViewerData> {
	const { version, tabs, activeTabId } = store.getState();
	return { version, tabs, activeTabId };
}

function apply(
	stores: WorkspacePaneStores,
	result: ReturnType<typeof reconcileAgentTabs>,
): void {
	if (!result.changed) return;
	if (stores.main.getState().tabs !== result.main.tabs) {
		stores.main.getState().replaceState(result.main);
	}
	stores.linked.forEach((linked, index) => {
		const next = result.linked[index];
		if (next && linked.getState().tabs !== next.tabs) {
			linked.getState().replaceState(next);
		}
	});
}
