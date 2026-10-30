import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/**
 * EXPERIMENT: the ACP chat pane, opt-in from Settings → Experimental. Read it
 * through `useAcpChatEnabled`.
 *
 * Desktop only: automations, cloud workspaces and mobile still read the
 * `acp-chat` flag.
 */
interface AcpChatState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useAcpChatStore = create<AcpChatState>()(
	devtools(
		persist(
			(set) => ({
				enabled: false,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{
				name: "acp-chat",
				version: 1,
				migrate: (persisted) =>
					({
						enabled: (persisted as { enabled?: unknown })?.enabled === true,
					}) as AcpChatState,
			},
		),
		{ name: "AcpChatStore" },
	),
);
