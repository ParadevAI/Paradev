import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useNewDashboardSidebarStore } from "renderer/stores/new-dashboard-sidebar";

/**
 * The new sidebar: cloud workspaces inline under their projects, the host
 * filter, and the redesigned workspace row. Needs cloud workspaces, since
 * the inline rows come from the cloud list; the Experimental setting decides,
 * and follows the inline flag until it is set.
 */
export function useNewDashboardSidebarEnabled(): boolean {
	const cloudWorkspaces = useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES);
	const inlineFlag = useFeatureFlagEnabled(
		FEATURE_FLAGS.SIDEBAR_INLINE_CLOUD_WORKSPACES,
	);
	const chosen = useNewDashboardSidebarStore((state) => state.enabled);
	return cloudWorkspaces === true && (chosen ?? inlineFlag === true);
}
