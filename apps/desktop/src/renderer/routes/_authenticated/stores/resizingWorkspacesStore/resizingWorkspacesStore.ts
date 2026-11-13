import { create } from "zustand";

/**
 * Cloud workspace ids with a machine-size change in flight. Module scope
 * because the menu that starts a change closes at once, and a second pick
 * from a reopened menu must not restart the box again.
 */
interface ResizingWorkspacesState {
	resizingIds: ReadonlySet<string>;
	markResizing: (workspaceId: string) => void;
	clearResizing: (workspaceId: string) => void;
}

export const useResizingWorkspacesStore = create<ResizingWorkspacesState>()(
	(set) => ({
		resizingIds: new Set<string>(),
		markResizing: (workspaceId) =>
			set((state) => {
				const next = new Set(state.resizingIds);
				next.add(workspaceId);
				return { resizingIds: next };
			}),
		clearResizing: (workspaceId) =>
			set((state) => {
				const next = new Set(state.resizingIds);
				next.delete(workspaceId);
				return { resizingIds: next };
			}),
	}),
);
