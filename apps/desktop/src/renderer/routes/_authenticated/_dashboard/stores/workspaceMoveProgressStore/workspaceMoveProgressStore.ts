import { create } from "zustand";

export type WorkspaceMoveProgressStage =
	| "saving"
	| "creating"
	| "moving-chats"
	| "ready"
	| "partial"
	| "failed"
	| "cancelled"
	| "unverified";

export interface WorkspaceMoveProgress {
	id: string;
	name: string;
	destination: string;
	stage: WorkspaceMoveProgressStage;
	chats: { total: number; ready: number; failed: number } | null;
	error: string | null;
	/** The stage the move was in when it failed: past `saving`, working agents were stopped. */
	failedDuring: WorkspaceMoveProgressStage | null;
	retry: (() => void) | null;
	cancel: (() => void) | null;
}

interface WorkspaceMoveProgressState {
	moves: Record<string, WorkspaceMoveProgress>;
	start: (move: WorkspaceMoveProgress) => void;
	update: (id: string, patch: Partial<WorkspaceMoveProgress>) => void;
	remove: (id: string) => void;
}

export const useWorkspaceMoveProgressStore = create<WorkspaceMoveProgressState>(
	(set) => ({
		moves: {},
		start: (move) =>
			set((state) => ({ moves: { ...state.moves, [move.id]: move } })),
		update: (id, patch) =>
			set((state) => {
				const move = state.moves[id];
				if (!move) return state;
				return { moves: { ...state.moves, [id]: { ...move, ...patch } } };
			}),
		remove: (id) =>
			set((state) => {
				const { [id]: _removed, ...moves } = state.moves;
				return { moves };
			}),
	}),
);

/** Saving and creating the destination take the first half; the chats share the rest. */
export function progressPercent(move: WorkspaceMoveProgress): number {
	switch (move.stage) {
		case "saving":
			return 10;
		case "creating":
			return 35;
		case "moving-chats": {
			const chats = move.chats;
			if (!chats || chats.total === 0) return 50;
			return 50 + Math.round((50 * (chats.ready + chats.failed)) / chats.total);
		}
		default:
			return 100;
	}
}
