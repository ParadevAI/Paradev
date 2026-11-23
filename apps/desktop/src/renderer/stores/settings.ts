import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChangesOpenTarget = "pane" | "tab";

interface Settings {
	diffStyle: "split" | "unified";
	showDiffComments: boolean;
	expandUnchanged: boolean;
	/** How the top-bar Changes button (and ⌘⇧G) opens the Changes surface:
	 * split the current tab, or focus/create a dedicated tab. */
	changesOpenTarget: ChangesOpenTarget;
	dictationEnabled: boolean;
	showParadevAnywhereButton: boolean;
	showRailUsage: boolean;
	hiddenRailUsageProviders: UsageAccount["agent"][];
}

interface SettingsStore extends Settings {
	update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
	toggleRailUsageProvider: (provider: UsageAccount["agent"]) => void;
}

export const useSettings = create<SettingsStore>()(
	persist(
		(set) => ({
			diffStyle: "split",
			showDiffComments: true,
			expandUnchanged: false,
			changesOpenTarget: "pane",
			dictationEnabled: true,
			showParadevAnywhereButton: true,
			showRailUsage: true,
			hiddenRailUsageProviders: [],
			update: (key, value) => set({ [key]: value }),
			toggleRailUsageProvider: (provider) =>
				set(({ hiddenRailUsageProviders }) => ({
					hiddenRailUsageProviders: hiddenRailUsageProviders.includes(provider)
						? hiddenRailUsageProviders.filter((agent) => agent !== provider)
						: [...hiddenRailUsageProviders, provider],
				})),
		}),
		{ name: "settings" },
	),
);
