import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlag } from "posthog-react-native";

/** Whether Cloud is offered as a place at all. */
export function useCloudScopeEnabled(): boolean {
	return Boolean(useFeatureFlag(FEATURE_FLAGS.CLOUD_WORKSPACES));
}
