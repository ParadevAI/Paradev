import {
	type CreatePaneInput,
	createWorkspaceStore,
	type WorkspaceState,
} from "@superset/panes";
import type {
	ChatPaneData,
	PaneViewerData,
	TerminalPaneData,
} from "../../../../types";
import {
	agentPaneClaims,
	claimKeys,
	isAgentPane,
	isClaimed,
	paneClaimKeys,
} from "../../../../utils/agentPaneClaims";
import {
	type ChatConversation,
	chatConversations,
	type ListedChatSession,
} from "../chatConversations";

type Layout = WorkspaceState<PaneViewerData>;

export interface ListedTerminalSession {
	terminalId: string;
	createdAt?: number;
}

/** What this desktop hid, and must not bring back as a tab. */
export interface AgentTabHiding {
	/** A chat tab closed here: in its undo window, or its stop still queued. */
	chatSession: (sessionId: string) => boolean;
	/** A terminal a closed chat tab or a fork loader ran under. */
	chatTerminal: (terminalId: string) => boolean;
	/** A terminal sent to the background, or a replacement that was cancelled. */
	terminal: (terminalId: string) => boolean;
	/** A chat opened on purpose here after it was closed elsewhere. */
	reopened: (sessionId: string) => boolean;
}

export interface ReconcileAgentTabsInput {
	main: Layout;
	/** The workspace's other pane areas; their panes count, new tabs never go there. */
	linked: readonly Layout[];
	/** Absent until the host has answered. */
	chats?: readonly ListedChatSession[];
	/** Absent until the host has answered. */
	terminals?: readonly ListedTerminalSession[];
	presetFor: (harness: string) => string | null | undefined;
	hiding: AgentTabHiding;
	/** Tabs opened from a cloud box's stored chats before the box answered. */
	storedSessionIds?: ReadonlySet<string>;
	/** The workspace opened with no tabs of the user's. */
	openedEmpty: boolean;
}

export interface ReconcileAgentTabsResult {
	main: Layout;
	linked: Layout[];
	changed: boolean;
}

interface PaneRef {
	area: number;
	tabId: string;
	paneId: string;
}

interface NewTab {
	at: number;
	chat: boolean;
	pane: CreatePaneInput<PaneViewerData>;
}

/**
 * The one writer of agent tabs the host owns. Every open agent conversation
 * gets exactly one pane across the workspace's pane areas, unless this
 * desktop hid it; a chat the user closed elsewhere loses its pane; two panes
 * on one chat, one chat terminal or one terminal collapse to the first. Idempotent: run it again on its
 * own output and nothing changes.
 */
export function reconcileAgentTabs(
	input: ReconcileAgentTabsInput,
): ReconcileAgentTabsResult {
	const areas = [input.main, ...input.linked];
	const removals = panesToRemove(input, areas);
	const kept = areas.map((layout, area) =>
		withoutPanes(
			layout,
			removals.filter((ref) => ref.area === area),
		),
	);
	const [keptMain, ...keptLinked] = kept as [Layout, ...Layout[]];
	const newTabs = tabsToAdd(input, kept);
	if (removals.length === 0 && newTabs.length === 0) {
		return { main: input.main, linked: [...input.linked], changed: false };
	}
	return {
		main: withNewTabs(keptMain, newTabs, input.openedEmpty),
		linked: keptLinked,
		changed: true,
	};
}

function panesToRemove(
	input: ReconcileAgentTabsInput,
	areas: readonly Layout[],
): PaneRef[] {
	const chatById = new Map(
		(input.chats ?? []).map((chat) => [chat.sessionId, chat]),
	);
	const conversations = chatConversations(input.chats ?? []);
	const conversationOf = new Map(
		conversations.flatMap((conversation) =>
			conversation.sessionIds.map((sessionId) => [sessionId, conversation]),
		),
	);
	const openOnTerminal = new Set(
		conversations.flatMap((conversation) =>
			conversation.open
				? [
						conversation.key,
						conversation.current.terminalId,
						conversation.current.launchTerminalId,
					].filter((id): id is string => !!id)
				: [],
		),
	);
	const shownTerminals = new Set<string>();
	const shownChatTerminals = new Set<string>();
	const shownSessions = new Set<string>();
	const removals: PaneRef[] = [];
	areas.forEach((layout, area) => {
		for (const tab of layout.tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (!isAgentPane(pane)) continue;
				const ref = { area, tabId: tab.id, paneId: pane.id };
				const { terminalId, sessionId } = paneClaimKeys(pane);
				if (pane.kind === "terminal" && terminalId) {
					if (shownTerminals.has(terminalId)) removals.push(ref);
					else shownTerminals.add(terminalId);
					continue;
				}
				if (pane.kind !== "chat-v3" || !sessionId) continue;
				if (
					shownSessions.has(sessionId) ||
					(terminalId && shownChatTerminals.has(terminalId)) ||
					(input.chats &&
						!(terminalId && openOnTerminal.has(terminalId)) &&
						closedForThisPane(input, chatById, conversationOf, sessionId))
				) {
					removals.push(ref);
					continue;
				}
				shownSessions.add(sessionId);
				if (terminalId) shownChatTerminals.add(terminalId);
			}
		}
	});
	return removals;
}

/**
 * A pane goes when its conversation was closed by a person elsewhere; a row
 * the conversation has since moved past does not take the pane with it.
 */
function closedForThisPane(
	input: ReconcileAgentTabsInput,
	chatById: ReadonlyMap<string, ListedChatSession>,
	conversationOf: ReadonlyMap<string, ChatConversation>,
	sessionId: string,
): boolean {
	const chat = chatById.get(sessionId);
	const conversation = conversationOf.get(sessionId);
	if (
		chat?.closedByUser === true &&
		!chat.live &&
		!conversation?.open &&
		!input.hiding.reopened(sessionId)
	) {
		return true;
	}
	return !!input.storedSessionIds?.has(sessionId) && !(chat && !chat.closedAt);
}

function tabsToAdd(
	input: ReconcileAgentTabsInput,
	areas: readonly Layout[],
): NewTab[] {
	const claims = agentPaneClaims(areas);
	const newTabs: NewTab[] = [];
	const conversations = chatConversations(input.chats ?? []).sort(
		(a, b) => a.updatedAt - b.updatedAt,
	);
	for (const conversation of conversations) {
		const { current } = conversation;
		if (!conversation.open) continue;
		const presetId = input.presetFor(current.harness);
		if (!presetId) continue;
		if (input.hiding.chatTerminal(conversation.key)) continue;
		if (conversation.sessionIds.some(input.hiding.chatSession)) continue;
		const keys = {
			terminalIds: [
				conversation.key,
				current.terminalId,
				current.launchTerminalId,
			],
			sessionIds: conversation.sessionIds,
		};
		const shown = isClaimed(claims, keys);
		claimKeys(claims, keys);
		if (shown) continue;
		newTabs.push({
			at: conversation.updatedAt,
			chat: true,
			pane: {
				kind: "chat-v3",
				data: {
					terminalId: conversation.key,
					sessionId: current.sessionId,
					agent: {
						id: presetId,
						...(current.harnessSessionId
							? { sessionId: current.harnessSessionId }
							: {}),
					},
					...(current.title ? { chatTitle: current.title } : {}),
				} satisfies ChatPaneData,
			},
		});
	}
	for (const terminal of input.terminals ?? []) {
		const { terminalId } = terminal;
		if (claims.terminalIds.has(terminalId)) continue;
		if (input.hiding.terminal(terminalId)) continue;
		claims.terminalIds.add(terminalId);
		newTabs.push({
			at: terminal.createdAt ?? 0,
			chat: false,
			pane: {
				kind: "terminal",
				data: { terminalId } satisfies TerminalPaneData,
			},
		});
	}
	return newTabs.sort((a, b) => a.at - b.at);
}

function withoutPanes(layout: Layout, refs: readonly PaneRef[]): Layout {
	if (refs.length === 0) return layout;
	const store = createWorkspaceStore<PaneViewerData>({ initialState: layout });
	for (const { tabId, paneId } of refs) {
		store.getState().closePane({ tabId, paneId, intent: "remove" });
	}
	return snapshot(store.getState());
}

/**
 * New tabs go last, oldest first, and keep the user's selection. A workspace
 * that opened empty, or on setup terminals alone, selects its newest chat;
 * one left with no tabs at all selects the oldest new tab.
 */
function withNewTabs(
	layout: Layout,
	newTabs: readonly NewTab[],
	openedEmpty: boolean,
): Layout {
	if (newTabs.length === 0) return layout;
	const selectChat =
		openedEmpty &&
		layout.tabs.every((tab) =>
			Object.values(tab.panes).every((pane) => pane.kind === "terminal"),
		);
	const store = createWorkspaceStore<PaneViewerData>({ initialState: layout });
	const addedTabIds: string[] = [];
	let newestChatTabId: string | null = null;
	for (const newTab of newTabs) {
		store.getState().addTab({ panes: [newTab.pane], focus: false });
		const tabId = store.getState().activeTabId;
		if (!tabId) continue;
		addedTabIds.push(tabId);
		if (newTab.chat) newestChatTabId = tabId;
	}
	const selected =
		(selectChat ? newestChatTabId : null) ??
		(layout.activeTabId &&
		layout.tabs.some((tab) => tab.id === layout.activeTabId)
			? layout.activeTabId
			: null) ??
		addedTabIds[0] ??
		null;
	if (selected) store.getState().setActiveTab(selected);
	return snapshot(store.getState());
}

function snapshot(state: Layout): Layout {
	return {
		version: state.version,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
	};
}
