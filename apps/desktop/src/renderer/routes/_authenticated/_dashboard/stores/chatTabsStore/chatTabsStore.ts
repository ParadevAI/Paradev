import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHAT_TABS_STORAGE_KEY = "chat-tabs";
/** Opening a tab past this closes the oldest, so the strip stays bounded. */
export const MAX_CHAT_TABS = 12;

export type ChatTabKind = "threads" | "channel" | "dev";

export interface ChatTab {
	id: string;
	kind: ChatTabKind;
	/** The channel or Dev the tab shows; unset for Threads. */
	entityId?: string;
	/** The href last shown in this tab; activating the tab returns there. */
	href: string;
}

export interface CloseChatTabResult {
	wasActive: boolean;
	/** The neighbour to show next, when the closed tab was the active one. */
	next: ChatTab | null;
}

interface ChatTabsState {
	tabs: ChatTab[];
	activeTabId: string | null;
	open: (tab: ChatTab) => void;
	close: (id: string) => CloseChatTabResult;
	/** Drops tabs whose channel or Dev is gone. */
	prune: (kind: "channel" | "dev", liveIds: ReadonlySet<string>) => void;
}

export const useChatTabsStore = create<ChatTabsState>()(
	persist(
		(set, get) => ({
			tabs: [],
			activeTabId: null,

			open: (tab) =>
				set((state) => {
					const existing = state.tabs.find(
						(candidate) => candidate.id === tab.id,
					);
					if (existing) {
						return {
							activeTabId: tab.id,
							tabs:
								existing.href === tab.href
									? state.tabs
									: state.tabs.map((candidate) =>
											candidate.id === tab.id
												? { ...candidate, href: tab.href }
												: candidate,
										),
						};
					}
					const tabs = [...state.tabs, tab];
					while (tabs.length > MAX_CHAT_TABS) tabs.shift();
					return { tabs, activeTabId: tab.id };
				}),

			close: (id) => {
				const { tabs, activeTabId } = get();
				const index = tabs.findIndex((tab) => tab.id === id);
				if (index === -1) return { wasActive: false, next: null };
				const remaining = tabs.filter((tab) => tab.id !== id);
				const wasActive = activeTabId === id;
				const next = wasActive
					? (remaining[index - 1] ?? remaining[index] ?? null)
					: null;
				set({
					tabs: remaining,
					activeTabId: wasActive ? (next?.id ?? null) : activeTabId,
				});
				return { wasActive, next };
			},

			prune: (kind, liveIds) =>
				set((state) => {
					const tabs = state.tabs.filter(
						(tab) =>
							tab.kind !== kind ||
							(tab.entityId !== undefined && liveIds.has(tab.entityId)),
					);
					if (tabs.length === state.tabs.length) return state;
					return {
						tabs,
						activeTabId: tabs.some((tab) => tab.id === state.activeTabId)
							? state.activeTabId
							: null,
					};
				}),
		}),
		{ name: CHAT_TABS_STORAGE_KEY, version: 1 },
	),
);

/** The tab a pathname shows in, or null outside the Chat section. */
export function describeChatTab(
	pathname: string,
): Omit<ChatTab, "href"> | null {
	if (pathname === "/channels/threads")
		return { id: "threads", kind: "threads" };
	const channel = /^\/channels\/([^/]+)/.exec(pathname);
	if (channel?.[1] && channel[1] !== "threads") {
		const entityId = decodeURIComponent(channel[1]);
		return { id: `channel:${entityId}`, kind: "channel", entityId };
	}
	const dev = /^\/devs\/([^/]+)/.exec(pathname);
	if (dev?.[1]) {
		const entityId = decodeURIComponent(dev[1]);
		return { id: `dev:${entityId}`, kind: "dev", entityId };
	}
	return null;
}
