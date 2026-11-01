import { create } from "zustand";
import { persist } from "zustand/middleware";

interface CodexModelsState {
	selectedIds: string[] | null;
	setSelectedIds: (ids: string[]) => void;
}

export const useCodexModels = create<CodexModelsState>()(
	persist(
		(set) => ({
			selectedIds: null,
			setSelectedIds: (ids) =>
				set({
					selectedIds: [...new Set(ids)]
						.filter((id) => id.length <= 256)
						.slice(0, 256),
				}),
		}),
		{
			name: "codex-picker-models",
			partialize: ({ selectedIds }) => ({ selectedIds }),
		},
	),
);
