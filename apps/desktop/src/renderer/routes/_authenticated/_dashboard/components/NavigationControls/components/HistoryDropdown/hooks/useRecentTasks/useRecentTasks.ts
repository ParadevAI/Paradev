import { useMemo } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	joinTasksWithStatuses,
	type RecentTaskEntry,
	type RecentTaskFields,
	TASK_LOOKUP_LIMIT,
} from "../../utils/joinTasksWithStatuses";
import { unresolvedTaskEntityIds } from "../../utils/unresolvedTaskEntityIds";
import type { RecentlyViewedEntry } from "../useRecentlyViewed";

/** Recently viewed tasks: the newest page, plus a lookup for older ones. */
export function useRecentTasks(
	entries: readonly RecentlyViewedEntry[],
): RecentTaskEntry[] {
	const organizationId = useActiveOrganizationId();
	const { data: taskPage, isSuccess: pageLoaded } =
		cloudTrpc.task.listPage.useQuery({ limit: TASK_LOOKUP_LIMIT });
	const { data: taskStatuses = [] } =
		cloudTrpc.task.statuses.list.useQuery(undefined);

	const unresolved = useMemo(
		() => (pageLoaded ? unresolvedTaskEntityIds(entries, taskPage.items) : []),
		[entries, pageLoaded, taskPage],
	);
	const lookups = cloudTrpc.useQueries((t) =>
		unresolved.map((entityId) =>
			t.task.byIdOrSlug(entityId, { staleTime: 60_000, retry: false }),
		),
	);
	const older = lookups.flatMap(
		({ data: task }): { task: RecentTaskFields }[] =>
			task && task.organizationId === organizationId ? [{ task }] : [],
	);
	return joinTasksWithStatuses(
		[...(taskPage?.items ?? []), ...older],
		taskStatuses,
	);
}
