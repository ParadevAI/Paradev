import type {
	BoxPressure,
	BoxPressureMessage,
} from "@superset/shared/box-pressure";
import { create } from "zustand";

interface BoxPressureState {
	workspaces: Record<string, BoxPressure>;
	dismissed: Record<string, string>;
	apply: (message: BoxPressureMessage) => void;
	dismiss: (workspaceId: string, episode: string) => void;
	clear: () => void;
}

export const useBoxPressureStore = create<BoxPressureState>()((set) => ({
	workspaces: {},
	dismissed: {},
	apply: (message) =>
		set((state) => {
			const next = message.snapshot ? {} : { ...state.workspaces };
			for (const [workspaceId, pressure] of Object.entries(
				message.workspaces,
			)) {
				if (pressure) next[workspaceId] = pressure;
				else delete next[workspaceId];
			}
			const dismissed = Object.fromEntries(
				Object.entries(state.dismissed).filter(
					([workspaceId]) => next[workspaceId]?.level === "critical",
				),
			);
			return { workspaces: next, dismissed };
		}),
	dismiss: (workspaceId, episode) =>
		set((state) => ({
			dismissed: { ...state.dismissed, [workspaceId]: episode },
		})),
	clear: () => set({ workspaces: {} }),
}));

export function useBoxPressure(workspaceId: string | null): BoxPressure | null {
	return useBoxPressureStore((state) =>
		workspaceId ? (state.workspaces[workspaceId] ?? null) : null,
	);
}

export function boxPressureEpisode(pressure: BoxPressure): string {
	return pressure.reap ? `reap:${pressure.reap.at}` : "stall";
}
