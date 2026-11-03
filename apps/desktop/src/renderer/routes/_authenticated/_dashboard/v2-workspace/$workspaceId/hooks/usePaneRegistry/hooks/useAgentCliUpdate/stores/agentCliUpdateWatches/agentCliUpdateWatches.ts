import { create } from "zustand";
import type { UpdateWatch as Watch } from "../../utils/hasUpdateLanded";

export function agentCliUpdateKey(
	workspaceId: string,
	harness: string | undefined,
): string {
	return `${workspaceId}:${harness ?? ""}`;
}

/**
 * Updates in flight, by workspace and harness. Opening the update terminal
 * splits the chat's pane, which remounts the chat, so component state would
 * forget the update it started.
 */
export const useAgentCliUpdateWatches = create<{
	watches: Record<string, Watch>;
	start: (key: string, watch: Watch) => void;
	patch: (key: string, patch: Partial<Watch>) => void;
	clear: (key: string) => void;
}>()((set) => ({
	watches: {},
	start: (key, watch) =>
		set((state) => ({ watches: { ...state.watches, [key]: watch } })),
	patch: (key, patch) =>
		set((state) => {
			const watch = state.watches[key];
			if (!watch) return state;
			return { watches: { ...state.watches, [key]: { ...watch, ...patch } } };
		}),
	clear: (key) =>
		set((state) => {
			if (!(key in state.watches)) return state;
			const { [key]: _cleared, ...watches } = state.watches;
			return { watches };
		}),
}));
