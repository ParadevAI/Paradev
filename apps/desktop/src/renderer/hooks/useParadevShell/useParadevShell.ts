import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";

let launchValue: boolean | undefined;

/**
 * Whether this launch runs the redesigned shell. Keeps the first answer
 * PostHog gives, so a flag change never swaps layouts (and remounts open
 * terminals) mid-session.
 */
export function useParadevShell(): boolean {
	const live = useFeatureFlagEnabled(FEATURE_FLAGS.PARADEV_SHELL);
	if (launchValue === undefined && live !== undefined) launchValue = live;
	return launchValue ?? false;
}
