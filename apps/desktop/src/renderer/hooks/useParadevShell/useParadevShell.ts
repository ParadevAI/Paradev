import { FEATURE_FLAGS } from "@superset/shared/constants";
import { posthog } from "renderer/lib/posthog";

let launchValue: boolean | undefined;

/**
 * Whether this launch runs the redesigned shell: PostHog's cached answer at the
 * first call, kept for the whole launch so a flag change never swaps layouts
 * (and remounts open terminals) mid-session. With nothing cached yet it reads
 * as off until the next launch.
 */
export function useParadevShell(): boolean {
	launchValue ??=
		posthog.isFeatureEnabled(FEATURE_FLAGS.PARADEV_SHELL, {
			send_event: false,
		}) === true;
	return launchValue;
}
