import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { env } from "renderer/env.renderer";
import { useIsOrganizationAdmin } from "renderer/hooks/useIsOrganizationAdmin";

export function usePluginsSettingsVisible(): boolean {
	const pluginsFlag = useFeatureFlagEnabled(FEATURE_FLAGS.PLUGINS);
	const isAdmin = useIsOrganizationAdmin() === true;
	return (env.NODE_ENV === "development" || pluginsFlag === true) && isAdmin;
}
