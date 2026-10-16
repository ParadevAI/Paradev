import { FEATURE_FLAGS } from "@superset/shared/constants";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { env } from "renderer/env.renderer";

/**
 * Dev builds bypass the flag: the local dev account is not in the release
 * condition, and the inbox has to be reachable to be worked on.
 */
export function useInboxEnabled(): boolean {
	const flag = useFeatureFlagEnabled(FEATURE_FLAGS.INBOX) ?? false;
	return flag || env.NODE_ENV === "development";
}
