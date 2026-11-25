import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ChangesOpenTarget = "pane" | "tab";
export type ComposerEnterBehavior = "send" | "newline";

interface Settings {
	diffStyle: "split" | "unified";
	showDiffComments: boolean;
	expandUnchanged: boolean;
	/** How the top-bar Changes button (and ⌘⇧G) opens the Changes surface:
	 * split the current tab, or focus/create a dedicated tab. */
	changesOpenTarget: ChangesOpenTarget;
	dictationEnabled: boolean;
	/** "newline": Enter adds a line in the chat composer and ⌘↩ sends. */
	composerEnterBehavior: ComposerEnterBehavior;
	showParadevAnywhereButton: boolean;
	showRailUsage: boolean;
}

interface SettingsStore extends Settings {
	update: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

export const useSettings = create<SettingsStore>()(
	persist(
		(set) => ({
			diffStyle: "split",
			showDiffComments: true,
			expandUnchanged: false,
			changesOpenTarget: "pane",
			dictationEnabled: true,
			composerEnterBehavior: "send",
			showParadevAnywhereButton: true,
			showRailUsage: true,
			update: (key, value) => set({ [key]: value }),
		}),
		{ name: "settings" },
	),
);
