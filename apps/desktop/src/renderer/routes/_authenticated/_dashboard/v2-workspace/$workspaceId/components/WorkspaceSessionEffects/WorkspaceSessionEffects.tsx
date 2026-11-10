import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import { useAutoAdoptBackgroundSessions } from "../../hooks/useAutoAdoptBackgroundSessions";
import { useConsumeAutomationRunLink } from "../../hooks/useConsumeAutomationRunLink";
import { useSyncChatSessionTabs } from "../../hooks/useSyncChatSessionTabs";
import type { ConsumeSearch, PaneViewerData } from "../../types";

type PaneStore = StoreApi<WorkspaceStore<PaneViewerData>>;

interface WorkspaceSessionEffectsProps {
	store: PaneStore;
	linkedStores: readonly PaneStore[];
	workspaceId: string;
	isLayoutReady: boolean;
	sessionId: string | undefined;
	terminalId: string | undefined;
	focusRequestId: string | undefined;
	consumeSearch: ConsumeSearch;
}

/**
 * These hooks re-render on every background refetch of the session lists.
 * Running them here, not in the page, keeps a poll from re-rendering the whole workspace.
 */
export function WorkspaceSessionEffects({
	store,
	linkedStores,
	workspaceId,
	isLayoutReady,
	sessionId,
	terminalId,
	focusRequestId,
	consumeSearch,
}: WorkspaceSessionEffectsProps) {
	useConsumeAutomationRunLink({
		store,
		linkedStores,
		isLayoutReady,
		workspaceId,
		sessionId,
		terminalId,
		focusRequestId,
		consumeSearch,
	});
	useAutoAdoptBackgroundSessions({
		store,
		linkedStores,
		workspaceId,
		isLayoutReady,
	});
	useSyncChatSessionTabs({ store, linkedStores, workspaceId, isLayoutReady });
	return null;
}
