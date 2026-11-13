import type {
	BoxPressure,
	BoxPressureMessage,
} from "@superset/shared/box-pressure";
import { create } from "zustand";

interface BoxPressureState {
	/** Cloud boxes under pressure in the active organization; a box that is fine has no entry. */
	workspaces: Record<string, BoxPressure>;
	/** Per workspace, the episode whose banner was dismissed. */
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
			return { workspaces: next };
		}),
	dismiss: (workspaceId, episode) =>
		set((state) => ({
			dismissed: { ...state.dismissed, [workspaceId]: episode },
		})),
	clear: () => set({ workspaces: {}, dismissed: {} }),
}));

export function useBoxPressure(workspaceId: string | null): BoxPressure | null {
	return useBoxPressureStore((state) =>
		workspaceId ? (state.workspaces[workspaceId] ?? null) : null,
	);
}

/** Identifies one out-of-memory episode: a kill, or a stall without one. */
export function boxPressureEpisode(pressure: BoxPressure): string {
	return pressure.reap ? `reap:${pressure.reap.at}` : "stall";
}
