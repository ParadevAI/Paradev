import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHANNEL_PANELS_STORAGE_KEY = "channel-panels-v1";
const MAX_CHANNELS = 20;
const MAX_TABS = 20;
/** Kinds with one tab each: opening another thread or person replaces what that tab shows, as Slack's side panel does. */
const SINGLE_TAB_KINDS = new Set<ChannelPanelTab["kind"]>([
	"thread",
	"profile",
]);

export type ChannelPanelTab = {
	kind: "thread" | "task" | "profile" | "new-tab";
	id: string;
	label: string;
};

interface ChannelPanel {
	tabs: ChannelPanelTab[];
	activeKey: string | null;
	isOpen: boolean;
	touchedAt: number;
}

interface ChannelPanelState {
	panels: Record<string, ChannelPanel>;
	/** Panel width in px; null until the user resizes it. */
	width: number | null;
	open: (
		channelId: string,
		tab: ChannelPanelTab,
		options?: { replaceKey?: string },
	) => void;
	openNewTab: (channelId: string) => void;
	activate: (channelId: string, key: string) => void;
	close: (channelId: string, key: string) => void;
	closeOthers: (channelId: string, key: string) => void;
	closeToRight: (channelId: string, key: string) => void;
	setOpen: (channelId: string, isOpen: boolean) => void;
	setWidth: (width: number | null) => void;
}

export const panelTabKey = (tab: Pick<ChannelPanelTab, "kind" | "id">) =>
	`${tab.kind}:${tab.id}`;

const newTab = (): ChannelPanelTab => ({
	kind: "new-tab",
	id: crypto.randomUUID(),
	label: "",
});

/** Keeps the most recently used channels; older ones lose their tabs. */
function bounded(
	panels: Record<string, ChannelPanel>,
): Record<string, ChannelPanel> {
	const entries = Object.entries(panels);
	if (entries.length <= MAX_CHANNELS) return panels;
	return Object.fromEntries(
		entries
			.sort(([, a], [, b]) => b.touchedAt - a.touchedAt)
			.slice(0, MAX_CHANNELS),
	);
}

/** A closed panel with no tabs has nothing to remember, so its key goes. */
function withPanel(
	panels: Record<string, ChannelPanel>,
	channelId: string,
	panel: Omit<ChannelPanel, "touchedAt">,
): Record<string, ChannelPanel> {
	const { [channelId]: _previous, ...rest } = panels;
	if (panel.tabs.length === 0 && !panel.isOpen) return rest;
	return bounded({ ...rest, [channelId]: { ...panel, touchedAt: Date.now() } });
}

function upsertTab(
	tabs: ChannelPanelTab[],
	tab: ChannelPanelTab,
	replaceKey?: string,
): ChannelPanelTab[] {
	const key = panelTabKey(tab);
	const without = tabs.filter((entry) => panelTabKey(entry) !== key);
	const replaceAt = replaceKey
		? without.findIndex((entry) => panelTabKey(entry) === replaceKey)
		: -1;
	if (replaceAt !== -1) {
		const next = [...without];
		next[replaceAt] = tab;
		return next;
	}
	if (without.length !== tabs.length) {
		return tabs.map((entry) => (panelTabKey(entry) === key ? tab : entry));
	}
	return [...tabs, tab].slice(-MAX_TABS);
}

export const useChannelPanelStore = create<ChannelPanelState>()(
	persist(
		(set) => ({
			panels: {},
			width: null,
			open: (channelId, tab, options) =>
				set((state) => {
					const current = state.panels[channelId]?.tabs ?? [];
					const sameKind = SINGLE_TAB_KINDS.has(tab.kind)
						? current.find((entry) => entry.kind === tab.kind)
						: undefined;
					const tabs = sameKind
						? upsertTab(current, tab, panelTabKey(sameKind)).filter(
								(entry) => panelTabKey(entry) !== options?.replaceKey,
							)
						: upsertTab(current, tab, options?.replaceKey);
					return {
						panels: withPanel(state.panels, channelId, {
							tabs,
							activeKey: panelTabKey(tab),
							isOpen: true,
						}),
					};
				}),
			openNewTab: (channelId) =>
				set((state) => {
					const tab = newTab();
					const current = state.panels[channelId]?.tabs ?? [];
					return {
						panels: withPanel(state.panels, channelId, {
							tabs: upsertTab(current, tab),
							activeKey: panelTabKey(tab),
							isOpen: true,
						}),
					};
				}),
			activate: (channelId, key) =>
				set((state) => {
					const panel = state.panels[channelId];
					if (!panel) return state;
					return {
						panels: withPanel(state.panels, channelId, {
							...panel,
							activeKey: key,
						}),
					};
				}),
			close: (channelId, key) =>
				set((state) => {
					const panel = state.panels[channelId];
					if (!panel) return state;
					const index = panel.tabs.findIndex(
						(entry) => panelTabKey(entry) === key,
					);
					const tabs = panel.tabs.filter((entry) => panelTabKey(entry) !== key);
					const fallback = tabs[Math.min(index, tabs.length - 1)];
					return {
						panels: withPanel(state.panels, channelId, {
							tabs,
							activeKey:
								panel.activeKey === key
									? fallback
										? panelTabKey(fallback)
										: null
									: panel.activeKey,
							isOpen: tabs.length > 0 && panel.isOpen,
						}),
					};
				}),
			closeOthers: (channelId, key) =>
				set((state) => {
					const panel = state.panels[channelId];
					if (!panel) return state;
					return {
						panels: withPanel(state.panels, channelId, {
							...panel,
							tabs: panel.tabs.filter((entry) => panelTabKey(entry) === key),
							activeKey: key,
						}),
					};
				}),
			closeToRight: (channelId, key) =>
				set((state) => {
					const panel = state.panels[channelId];
					if (!panel) return state;
					const index = panel.tabs.findIndex(
						(entry) => panelTabKey(entry) === key,
					);
					if (index === -1) return state;
					const tabs = panel.tabs.slice(0, index + 1);
					const activeKept = tabs.some(
						(entry) => panelTabKey(entry) === panel.activeKey,
					);
					return {
						panels: withPanel(state.panels, channelId, {
							...panel,
							tabs,
							activeKey: activeKept ? panel.activeKey : key,
						}),
					};
				}),
			setOpen: (channelId, isOpen) =>
				set((state) => {
					const panel = state.panels[channelId];
					const tabs = panel?.tabs ?? [];
					if (isOpen && tabs.length === 0) {
						const tab = newTab();
						return {
							panels: withPanel(state.panels, channelId, {
								tabs: [tab],
								activeKey: panelTabKey(tab),
								isOpen: true,
							}),
						};
					}
					return {
						panels: withPanel(state.panels, channelId, {
							tabs,
							activeKey: panel?.activeKey ?? null,
							isOpen,
						}),
					};
				}),
			setWidth: (width) => set({ width }),
		}),
		{
			name: CHANNEL_PANELS_STORAGE_KEY,
			version: 2,
			migrate: (persisted, version) => {
				const state = persisted as {
					panels?: Record<string, Omit<ChannelPanel, "isOpen">>;
				};
				if (version < 2) {
					return {
						width: null,
						panels: Object.fromEntries(
							Object.entries(state.panels ?? {}).map(([id, panel]) => [
								id,
								{ ...panel, isOpen: panel.tabs.length > 0 },
							]),
						),
					};
				}
				return persisted as ChannelPanelState;
			},
		},
	),
);
