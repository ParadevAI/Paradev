import type { StoreApi } from "zustand/vanilla";
import type { WorkspaceState } from "../../types";
import type { WorkspaceStore } from "../store";

/** Where a store's layout lives. `subscribe` fires after the stored layout changed. */
export interface WorkspaceStateSource<TData> {
	get(): WorkspaceState<TData>;
	set(next: WorkspaceState<TData>): void;
	subscribe(onChange: () => void): () => void;
}

function layoutOf<TData>(state: WorkspaceState<TData>): WorkspaceState<TData> {
	return {
		version: state.version,
		tabs: state.tabs,
		activeTabId: state.activeTabId,
	};
}

function sameLayout<TData>(
	a: WorkspaceState<TData>,
	b: WorkspaceState<TData>,
): boolean {
	return JSON.stringify(layoutOf(a)) === JSON.stringify(layoutOf(b));
}

/**
 * Makes `source` the only writable copy of the store's layout: store actions
 * write through to it, and changes made elsewhere replace the store's layout.
 */
export function connectWorkspaceStore<TData>(
	store: StoreApi<WorkspaceStore<TData>>,
	source: WorkspaceStateSource<TData>,
): () => void {
	let applying = false;
	const apply = () => {
		const next = source.get();
		if (sameLayout(next, store.getState())) return;
		applying = true;
		try {
			store.getState().replaceState(layoutOf(next));
		} finally {
			applying = false;
		}
	};
	apply();
	const offSource = source.subscribe(apply);
	const offStore = store.subscribe((state, prev) => {
		if (applying) return;
		if (state.tabs === prev.tabs && state.activeTabId === prev.activeTabId)
			return;
		source.set(layoutOf(state));
	});
	return () => {
		offSource();
		offStore();
	};
}
