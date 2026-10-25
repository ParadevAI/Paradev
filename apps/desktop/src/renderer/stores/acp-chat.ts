import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: the ACP chat pane. Needs the `acp-chat` flag; with it on,
 * `enabled` is null until the person sets it, and null means on. Read it
 * through `useAcpChatEnabled`.
 *
 * Desktop only: automations and cloud workspaces open chats from the flag
 * alone.
 *
 * To conclude the experiment, remove: this store, its toggle in
 * `ExperimentalSettings` and its `settings-search` entry
 * (`EXPERIMENTAL_ACP_CHAT`), and read the flag directly again.
 */
interface AcpChatState {
	enabled: boolean | null;
	setEnabled: (enabled: boolean) => void;
}

export const useAcpChatStore = create<AcpChatState>()(
	devtools(
		persist(
			(set) => ({
				enabled: null,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "acp-chat" },
		),
		{ name: "AcpChatStore" },
	),
);
