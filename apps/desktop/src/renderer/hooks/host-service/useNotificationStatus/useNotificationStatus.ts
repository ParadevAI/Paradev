import { useMemo } from "react";
import { useQueryCacheData } from "renderer/hooks/useQueryCacheData";
import {
	getNotificationSourceKey,
	getNotificationSourcesForPane,
	type NotificationPaneLike,
	type NotificationSourceInput,
	useNotificationStore,
} from "renderer/stores/notifications";
import {
	type ActivePaneStatus,
	getHighestPriorityStatus,
} from "shared/tabs-types";
import {
	TERMINAL_AGENT_BINDINGS_QUERY_KEY_PREFIX,
	type TerminalAgentBinding,
} from "../useTerminalAgentBindings";
import {
	deriveTerminalAgentStatus,
	useTerminalAgentStatuses,
} from "../useTerminalAgentStatuses";

const TERMINAL_PREFIX = "terminal:";

function terminalIdsFromSources(
	sources: Iterable<NotificationSourceInput>,
): string[] {
	const ids: string[] = [];
	for (const key of new Set([...sources].map(getNotificationSourceKey))) {
		if (key.startsWith(TERMINAL_PREFIX)) {
			ids.push(key.slice(TERMINAL_PREFIX.length));
		}
	}
	return ids;
}

/**
 * Highest-priority status across a set of notification sources. Terminal
 * statuses are derived from host agent bindings (the single source of
 * truth); chat sources have no status yet and contribute nothing.
 */
export function useSourcesNotificationStatus(
	workspaceId: string,
	sources: Iterable<NotificationSourceInput>,
): ActivePaneStatus | null {
	const statuses = useTerminalAgentStatuses(workspaceId);
	return getHighestPriorityStatus(
		terminalIdsFromSources(sources).map((terminalId) =>
			statuses.get(terminalId),
		),
	);
}

export function usePaneNotificationStatus(
	workspaceId: string,
	pane: NotificationPaneLike | null | undefined,
): ActivePaneStatus | null {
	return useSourcesNotificationStatus(
		workspaceId,
		getNotificationSourcesForPane(pane),
	);
}

/**
 * Number of distinct workspaces needing attention (any derived terminal
 * status other than `working`, or a manual unread mark). Drives the OS dock
 * badge. Aggregates over the bindings queries already mounted by the
 * sidebar's workspace status provider via the react-query cache; workspaces
 * with no observed bindings query contribute only their manual unread mark.
 */
export function useAttentionWorkspaceCount(): number {
	const bindingLists = useQueryCacheData<TerminalAgentBinding[]>(
		TERMINAL_AGENT_BINDINGS_QUERY_KEY_PREFIX,
	);
	const manualUnread = useNotificationStore((state) => state.manualUnread);
	const terminalSeenAt = useNotificationStore((state) => state.terminalSeenAt);
	return useMemo(
		() => countAttentionWorkspaces(bindingLists, manualUnread, terminalSeenAt),
		[bindingLists, manualUnread, terminalSeenAt],
	);
}

function countAttentionWorkspaces(
	bindingLists: readonly TerminalAgentBinding[][],
	manualUnread: Record<string, true>,
	terminalSeenAt: Record<string, number>,
): number {
	const workspaceIds = new Set(Object.keys(manualUnread));
	for (const bindings of bindingLists) {
		for (const binding of bindings) {
			const status = deriveTerminalAgentStatus({
				lastEventType: binding.lastEventType,
				lastEventAt: binding.lastEventAt,
				lastSeenAt: terminalSeenAt[binding.terminalId],
			});
			if (
				status === "permission" ||
				status === "review" ||
				status === "failed"
			) {
				workspaceIds.add(binding.workspaceId);
			}
		}
	}
	return workspaceIds.size;
}
