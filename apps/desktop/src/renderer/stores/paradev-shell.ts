import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** Read once per launch by `useParadevShell`. */
interface ParadevShellState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useParadevShellStore = create<ParadevShellState>()(
	devtools(
		persist(
			(set) => ({
				enabled: true,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "paradev-shell" },
		),
		{ name: "ParadevShellStore" },
	),
);
