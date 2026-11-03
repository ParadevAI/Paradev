import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	type AccessibleV2Workspace,
	useAccessibleV2Workspaces,
} from "renderer/routes/_authenticated/_dashboard/v2-workspaces/hooks/useAccessibleV2Workspaces";
import {
	bucketWorkspaces,
	type SwitcherGroup,
} from "../../utils/bucketWorkspaces";
import {
	parseSwitcherQuery,
	type SwitcherQuery,
} from "../../utils/parseSwitcherQuery";
import { scopeWorkspaces } from "../../utils/scopeWorkspaces";

export interface SwitcherGroups {
	groups: SwitcherGroup<AccessibleV2Workspace>[];
	query: SwitcherQuery;
}

/** The workspaces the query reaches, in switcher order, with the viewed one marked current. */
export function useSwitcherGroups(rawQuery: string): SwitcherGroups {
	const { all: workspaces } = useAccessibleV2Workspaces();
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const currentId = currentPath.match(/^\/v2-workspace\/([^/]+)/)?.[1] ?? null;
	const query = useMemo(
		() =>
			parseSwitcherQuery(
				rawQuery,
				workspaces.map((workspace) => workspace.createdByName),
			),
		[rawQuery, workspaces],
	);
	const groups = useMemo(
		() =>
			bucketWorkspaces(
				scopeWorkspaces(workspaces, query, currentId),
				currentId,
			),
		[workspaces, query, currentId],
	);
	return { groups, query };
}
