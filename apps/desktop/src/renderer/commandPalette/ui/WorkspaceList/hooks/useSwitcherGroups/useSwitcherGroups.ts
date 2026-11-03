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

/** Every reachable workspace in switcher order, with the viewed one marked current. */
export function useSwitcherGroups(): SwitcherGroup<AccessibleV2Workspace>[] {
	const { all: workspaces } = useAccessibleV2Workspaces();
	const currentPath = useLocation({ select: (loc) => loc.pathname });
	const currentId = currentPath.match(/^\/v2-workspace\/([^/]+)/)?.[1] ?? null;
	return useMemo(
		() => bucketWorkspaces(workspaces, currentId),
		[workspaces, currentId],
	);
}
