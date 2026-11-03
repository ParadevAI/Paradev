import { create } from "zustand";

export const useDismissedLimitWarnings = create<{
	keys: ReadonlySet<string>;
	dismiss: (key: string) => void;
	release: (prefix: string) => void;
}>()((set) => ({
	keys: new Set(),
	dismiss: (key) => set((state) => ({ keys: new Set(state.keys).add(key) })),
	release: (prefix) =>
		set((state) => {
			const keys = [...state.keys].filter((key) => !key.startsWith(prefix));
			return keys.length === state.keys.size ? state : { keys: new Set(keys) };
		}),
}));
