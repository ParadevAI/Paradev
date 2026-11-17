import { useLocation } from "@tanstack/react-router";
import { useMemo } from "react";
import {
	type AccessibleV2Workspace,
	useAccessibleWorkspaces,
} from "renderer/routes/_authenticated/_dashboard/workspaces/hooks/useAccessibleWorkspaces";
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

export function useSwitcherGroups(
	rawQuery: string,
	enabled = true,
): SwitcherGroups {
	const { all: workspaces } = useAccessibleWorkspaces({
		liveState: !enabled
			? undefined
			: rawQuery.trimStart().startsWith("#")
				? "status"
				: "cached",
	});
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
