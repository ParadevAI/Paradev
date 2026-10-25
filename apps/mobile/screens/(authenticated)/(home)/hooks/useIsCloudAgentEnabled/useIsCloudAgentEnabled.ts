import { isCloudAgentId } from "@superset/shared/cloud-agent-launch";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { isAgentPresetEnabled } from "@superset/shared/host-agent-presets";
import { useFeatureFlag } from "posthog-react-native";
import { useCallback } from "react";

/** Whether a cloud workspace can launch this agent for this person: installed in the box and not behind an off flag. */
export function useIsCloudAgentEnabled(): (agentId: string) => boolean {
	const pdevAgent = Boolean(useFeatureFlag(FEATURE_FLAGS.PDEV_AGENT));
	return useCallback(
		(agentId: string) =>
			isCloudAgentId(agentId) &&
			isAgentPresetEnabled(
				agentId,
				pdevAgent ? [FEATURE_FLAGS.PDEV_AGENT] : [],
			),
		[pdevAgent],
	);
}
