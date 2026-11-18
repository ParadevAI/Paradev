import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { track } from "renderer/lib/analytics";
import { navigateToWorkspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/workspaces/hooks/useAccessibleWorkspaces";
import { useFrameStackStore } from "../../../../core/frames";
import type { SwitcherRow } from "../../utils/bucketWorkspaces";

export type SwitchedVia = "switcher" | "palette";

export interface SwitchDetails {
	searched: boolean;
	hold: boolean;
}

export function useSwitchToWorkspace(via: SwitchedVia) {
	const navigate = useNavigate();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	return useCallback(
		(
			row: SwitcherRow<AccessibleV2Workspace>,
			index: number,
			details: SwitchDetails,
		) => {
			setOpen(false);
			if (row.isCurrent) return;
			track("workspace_switched", {
				via,
				bucket: row.bucket,
				index,
				...details,
			});
			void navigateToWorkspace(row.workspace.id, navigate);
		},
		[via, setOpen, navigate],
	);
}
