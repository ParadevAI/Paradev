import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

/** EXPERIMENT: the redesigned desktop shell. Off by default; read once per launch by `useParadevShell`. */
interface ParadevShellState {
	enabled: boolean;
	setEnabled: (enabled: boolean) => void;
}

export const useParadevShellStore = create<ParadevShellState>()(
	devtools(
		persist(
			(set) => ({
				enabled: false,
				setEnabled: (enabled) => set({ enabled }),
			}),
			{ name: "paradev-shell" },
		),
		{ name: "ParadevShellStore" },
	),
);
