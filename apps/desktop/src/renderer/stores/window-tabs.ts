import { create } from "zustand";
import { persist } from "zustand/middleware";

export const WINDOW_TABS_STORAGE_KEY = "window-tabs";
/** Opening a tab past this closes the oldest ones, so the strip stays bounded. */
export const MAX_WINDOW_TABS = 16;

export type WindowTabKind =
	| "home"
	| "workspace"
	| "workspaces"
	| "channels"
	| "devs"
	| "tasks"
	| "pull-requests"
	| "pages"
	| "automations"
	| "plugins"
	| "projects"
	| "environments"
	| "cloud-workspaces";

export interface WindowTab {
	id: string;
	kind: WindowTabKind;
	/** The href last shown in this tab; activating the tab returns there. */
	href: string;
	workspaceId?: string;
}

export interface CloseWindowTabResult {
	wasActive: boolean;
	/** The neighbour to show next, when the closed tab was the active one. */
	next: WindowTab | null;
}

interface WindowTabsState {
	tabs: WindowTab[];
	activeTabId: string | null;
	open: (tab: WindowTab) => void;
	close: (id: string) => CloseWindowTabResult;
}

export const useWindowTabsStore = create<WindowTabsState>()(
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
					while (tabs.length > MAX_WINDOW_TABS) tabs.shift();
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
		}),
		{ name: WINDOW_TABS_STORAGE_KEY, version: 1 },
	),
);
