import { create } from "zustand";
import { persist } from "zustand/middleware";

export const CHANNEL_PANELS_STORAGE_KEY = "channel-panels-v1";
const MAX_CHANNELS = 20;
const MAX_TABS = 8;

export type ChannelPanelTab = {
	kind: "thread" | "task";
	id: string;
	label: string;
};

interface ChannelPanel {
	tabs: ChannelPanelTab[];
	activeKey: string | null;
	touchedAt: number;
}

interface ChannelPanelState {
	panels: Record<string, ChannelPanel>;
	open: (channelId: string, tab: ChannelPanelTab) => void;
	activate: (channelId: string, key: string) => void;
	close: (channelId: string, key: string) => void;
	closeAll: (channelId: string) => void;
}

export const panelTabKey = (tab: Pick<ChannelPanelTab, "kind" | "id">) =>
	`${tab.kind}:${tab.id}`;

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

function withPanel(
	panels: Record<string, ChannelPanel>,
	channelId: string,
	panel: ChannelPanel | null,
): Record<string, ChannelPanel> {
	const { [channelId]: _previous, ...rest } = panels;
	if (!panel || panel.tabs.length === 0) return rest;
	return bounded({ ...rest, [channelId]: panel });
}

/**
 * Open right-panel tabs per channel. Bounded to MAX_CHANNELS channels by last
 * use and MAX_TABS tabs each; closing the last tab removes the channel's key.
 */
export const useChannelPanelStore = create<ChannelPanelState>()(
	persist(
		(set) => ({
			panels: {},
			open: (channelId, tab) =>
				set((state) => {
					const key = panelTabKey(tab);
					const current = state.panels[channelId]?.tabs ?? [];
					const tabs = current.some((entry) => panelTabKey(entry) === key)
						? current.map((entry) => (panelTabKey(entry) === key ? tab : entry))
						: [...current, tab].slice(-MAX_TABS);
					return {
						panels: withPanel(state.panels, channelId, {
							tabs,
							activeKey: key,
							touchedAt: Date.now(),
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
							touchedAt: Date.now(),
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
							touchedAt: Date.now(),
						}),
					};
				}),
			closeAll: (channelId) =>
				set((state) => ({
					panels: withPanel(state.panels, channelId, null),
				})),
		}),
		{ name: CHANNEL_PANELS_STORAGE_KEY, version: 1 },
	),
);
