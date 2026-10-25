import { FEATURE_FLAGS } from "@superset/shared/constants";
import { isAgentPresetEnabled } from "@superset/shared/host-agent-presets";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useCallback } from "react";

export function useIsAgentPresetEnabled(): (presetId: string) => boolean {
	const pdevAgent = useFeatureFlagEnabled(FEATURE_FLAGS.PDEV_AGENT) === true;
	return useCallback(
		(presetId: string) =>
			isAgentPresetEnabled(
				presetId,
				pdevAgent ? [FEATURE_FLAGS.PDEV_AGENT] : [],
			),
		[pdevAgent],
	);
}
