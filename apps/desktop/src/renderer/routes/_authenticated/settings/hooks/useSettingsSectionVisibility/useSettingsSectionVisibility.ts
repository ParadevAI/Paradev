import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useMemo } from "react";
import { env } from "renderer/env.renderer";
import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";
import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { getAllowedSectionsForVariant } from "../../utils/settings-search";
import type { SettingsSectionVisibility } from "../../utils/settingsSections";

/** Which settings sections this user can open here: platform, role, flags and app variant. */
export function useSettingsSectionVisibility(): SettingsSectionVisibility {
	const mobileEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.MOBILE_LAUNCH) === true;
	const pluginsFlag = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const pluginsEnabled = env.NODE_ENV === "development" || pluginsFlag === true;
	const isAdmin = useIsOrganizationAdmin() === true;
	const { data: platform } = electronTrpc.window.getPlatform.useQuery();
	const isMac = platform === "darwin";
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const cloudWorkspacesEnabled =
		useFeatureFlagEnabled(FEATURE_FLAGS.CLOUD_WORKSPACES) === true;
	const allowedSections = useMemo(
		() =>
			getAllowedSectionsForVariant(isV2CloudEnabled, cloudWorkspacesEnabled),
		[isV2CloudEnabled, cloudWorkspacesEnabled],
	);
	return useMemo(
		() => ({ isMac, isAdmin, mobileEnabled, pluginsEnabled, allowedSections }),
		[isMac, isAdmin, mobileEnabled, pluginsEnabled, allowedSections],
	);
}
