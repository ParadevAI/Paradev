import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHAT_TABS_STORAGE_KEY = "chat-tabs";
/** Opening a tab past this closes the oldest, so the strip stays bounded. */
export const MAX_CHAT_TABS = 12;
/** A longer href is stored as its pathname alone, so a long search string cannot grow the store. */
export const MAX_CHAT_TAB_HREF_LENGTH = 512;

export type ChatTabKind = "threads" | "channel" | "dev";

export interface ChatTabRoute {
	kind: ChatTabKind;
	/** The channel or Dev the tab shows; unset for Threads. */
	entityId?: string;
}

export interface ChatTab extends ChatTabRoute {
	id: string;
	organizationId: string;
	/** The href last shown in this tab; activating the tab returns there. */
	href: string;
}

export interface CloseChatTabResult {
	wasActive: boolean;
	/** The neighbour to show next, when the closed tab was the active one. */
	next: ChatTab | null;
}

interface PruneChatTabsInput {
	organizationId: string;
	kind: "channel" | "dev";
	liveIds: ReadonlySet<string>;
	/** The tab of the route on screen; its page reports a missing channel or Dev itself. */
	keepId?: string | null;
}

interface ChatTabsState {
	tabs: ChatTab[];
	activeTabId: string | null;
	open: (tab: ChatTab) => void;
	close: (id: string) => CloseChatTabResult;
	/** Drops the organization's tabs whose channel or Dev is gone. */
	prune: (input: PruneChatTabsInput) => void;
}

export function createChatTab({
	organizationId,
	route,
	pathname,
	href,
}: {
	organizationId: string;
	route: ChatTabRoute;
	pathname: string;
	href: string;
}): ChatTab {
	return {
		id:
			route.kind === "threads"
				? `${organizationId}:threads`
				: `${organizationId}:${route.kind}:${route.entityId}`,
		organizationId,
		...route,
		href: href.length > MAX_CHAT_TAB_HREF_LENGTH ? pathname : href,
	};
}

export function organizationChatTabs(
	tabs: readonly ChatTab[],
	organizationId: string | null,
): ChatTab[] {
	return tabs.filter((tab) => tab.organizationId === organizationId);
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
				const closing = tabs.find((tab) => tab.id === id);
				if (!closing) return { wasActive: false, next: null };
				const siblings = organizationChatTabs(tabs, closing.organizationId);
				const index = siblings.indexOf(closing);
				const remaining = siblings.filter((tab) => tab.id !== id);
				const wasActive = activeTabId === id;
				const next = wasActive
					? (remaining[index - 1] ?? remaining[index] ?? null)
					: null;
				set({
					tabs: tabs.filter((tab) => tab.id !== id),
					activeTabId: wasActive ? (next?.id ?? null) : activeTabId,
				});
				return { wasActive, next };
			},

			prune: ({ organizationId, kind, liveIds, keepId }) =>
				set((state) => {
					const tabs = state.tabs.filter(
						(tab) =>
							tab.organizationId !== organizationId ||
							tab.kind !== kind ||
							tab.id === keepId ||
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
		{
			name: CHAT_TABS_STORAGE_KEY,
			version: 2,
			// Version 1 tabs carry no organization, so nothing can scope them.
			migrate: () => ({ tabs: [], activeTabId: null }),
		},
	),
);

function decodeSegment(segment: string): string | null {
	try {
		return decodeURIComponent(segment);
	} catch {
		return null;
	}
}

/** The tab a pathname shows in, or null outside the Chat section. */
export function describeChatTab(pathname: string): ChatTabRoute | null {
	if (pathname === "/channels/threads") return { kind: "threads" };
	const channel = /^\/channels\/([^/]+)/.exec(pathname);
	if (channel?.[1] && channel[1] !== "threads") {
		const entityId = decodeSegment(channel[1]);
		return entityId === null ? null : { kind: "channel", entityId };
	}
	const dev = /^\/devs\/([^/]+)/.exec(pathname);
	if (dev?.[1]) {
		const entityId = decodeSegment(dev[1]);
		return entityId === null ? null : { kind: "dev", entityId };
	}
	return null;
}

export function isChatPathname(pathname: string): boolean {
	return /^\/(channels|devs)(\/|$)/.test(pathname);
}
