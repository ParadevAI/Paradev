import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import { useAutoAdoptChatSessions } from "../../hooks/useAutoAdoptChatSessions";
import { useClearActivePaneAttention } from "../../hooks/useClearActivePaneAttention";
import type { PaneViewerData } from "../../types";

type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;

interface WorkspaceAgentEffectsProps {
	workspaceId: string;
	store: PaneStore;
	rightStore: PaneStore;
	linkedStores: readonly PaneStore[];
	isLayoutReady: boolean;
}

/**
 * Agent bindings change on every hook event. Reading them here, not in the
 * page, keeps an event from re-rendering the whole workspace.
 */
export function WorkspaceAgentEffects({
	workspaceId,
	store,
	rightStore,
	linkedStores,
	isLayoutReady,
}: WorkspaceAgentEffectsProps) {
	useClearActivePaneAttention({ store });
	useClearActivePaneAttention({ store: rightStore });
	useAutoAdoptChatSessions({
		store,
		linkedStores,
		workspaceId,
		isLayoutReady,
	});
	return null;
}
