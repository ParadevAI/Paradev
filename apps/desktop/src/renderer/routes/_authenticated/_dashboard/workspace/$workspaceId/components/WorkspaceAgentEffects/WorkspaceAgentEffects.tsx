import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import { useClearActivePaneAttention } from "../../hooks/useClearActivePaneAttention";
import type { PaneViewerData } from "../../types";

type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;

interface WorkspaceAgentEffectsProps {
	store: PaneStore;
	rightStore: PaneStore;
}

/**
 * Agent bindings change on every hook event. Reading them here, not in the
 * page, keeps an event from re-rendering the whole workspace.
 */
export function WorkspaceAgentEffects({
	store,
	rightStore,
}: WorkspaceAgentEffectsProps) {
	useClearActivePaneAttention({ store });
	useClearActivePaneAttention({ store: rightStore });
	return null;
}
