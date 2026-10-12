import { create } from "zustand";

interface UndoEntry {
	id: string;
	undo: () => void;
}

interface UndoStackState {
	entries: UndoEntry[];
	push: (entry: UndoEntry) => void;
	remove: (id: string) => void;
	undoLatest: () => void;
}

export const useUndoStack = create<UndoStackState>((set, get) => ({
	entries: [],
	push: (entry) =>
		set((state) => ({
			entries: [...state.entries.filter(({ id }) => id !== entry.id), entry],
		})),
	remove: (id) =>
		set((state) => ({
			entries: state.entries.filter((entry) => entry.id !== id),
		})),
	undoLatest: () => {
		const latest = get().entries.at(-1);
		if (!latest) return;
		get().remove(latest.id);
		latest.undo();
	},
}));
