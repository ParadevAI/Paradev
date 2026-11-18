import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getOfferedSections } from "../../utils/settings-search";
import type { SettingsSectionVisibility } from "../../utils/settingsSections";

export function useSettingsSectionVisibility(): SettingsSectionVisibility {
	const pluginsFlag = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const pluginsEnabled = env.NODE_ENV === "development" || pluginsFlag === true;
	const isAdmin = useIsOrganizationAdmin() === true;
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const cloudWorkspacesEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES) === true;
	const allowedSections = useMemo(
		() => getOfferedSections(cloudWorkspacesEnabled),
		[cloudWorkspacesEnabled],
	);
	return useMemo(
		() => ({ isMac, isAdmin, pluginsEnabled, allowedSections }),
		[isMac, isAdmin, pluginsEnabled, allowedSections],
	);
}
