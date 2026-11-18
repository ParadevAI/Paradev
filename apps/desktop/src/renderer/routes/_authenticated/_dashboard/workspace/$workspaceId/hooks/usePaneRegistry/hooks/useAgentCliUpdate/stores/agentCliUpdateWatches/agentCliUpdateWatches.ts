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
	patch: (key: string, id: string, patch: Partial<Watch>) => void;
	/** Without `id`, clears whatever update is in flight for `key`. */
	clear: (key: string, id?: string) => void;
}>()((set) => ({
	watches: {},
	start: (key, watch) =>
		set((state) => ({ watches: { ...state.watches, [key]: watch } })),
	patch: (key, id, patch) =>
		set((state) => {
			const watch = state.watches[key];
			if (watch?.id !== id) return state;
			return { watches: { ...state.watches, [key]: { ...watch, ...patch } } };
		}),
	clear: (key, id) =>
		set((state) => {
			const watch = state.watches[key];
			if (!watch || (id !== undefined && watch.id !== id)) return state;
			const { [key]: _cleared, ...watches } = state.watches;
			return { watches };
		}),
}));
