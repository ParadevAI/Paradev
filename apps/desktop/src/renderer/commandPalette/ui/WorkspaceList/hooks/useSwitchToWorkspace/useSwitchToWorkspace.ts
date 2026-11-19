import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { track } from "renderer/lib/analytics";
import { reportRendererError } from "renderer/lib/report-renderer-error";
import { navigateToWorkspaceAndThen } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import type { AccessibleV2Workspace } from "renderer/routes/_authenticated/_dashboard/workspaces/hooks/useAccessibleWorkspaces";
import { useFrameStackStore } from "../../../../core/frames";
import type { SwitcherRow } from "../../utils/bucketWorkspaces";

export type SwitchedVia = "switcher" | "palette";

export interface SwitchDetails {
	searched: boolean;
	hold: boolean;
}

export function useSwitchToWorkspace(via: SwitchedVia) {
	const router = useRouter();
	const setOpen = useFrameStackStore((s) => s.setOpen);
	return useCallback(
		(
			row: SwitcherRow<AccessibleV2Workspace>,
			index: number,
			details: SwitchDetails,
		) => {
			setOpen(false);
			if (row.isCurrent) return;
			void navigateToWorkspaceAndThen(row.workspace.id, router, () => {
				track("workspace_switched", {
					via,
					bucket: row.bucket,
					index,
					...details,
				});
			}).catch(reportRendererError);
		},
		[via, setOpen, router],
	);
}
