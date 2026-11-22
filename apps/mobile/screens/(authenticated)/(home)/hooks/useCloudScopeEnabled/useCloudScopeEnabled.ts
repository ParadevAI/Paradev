import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlag } from "posthog-react-native";

export function useCloudScopeEnabled(): boolean {
	return Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
}
