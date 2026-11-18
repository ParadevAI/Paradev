import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { PostHog } from "posthog-node";

/** Fails closed. The organization's flag is asked only while the fleet switch is on. */
export async function boxLogsEnabled(
	flags: Pick<PostHog, "isFeatureEnabled">,
	organizationId: string,
): Promise<boolean> {
	const fleet = await flags
		.isFeatureEnabled(FEATURE_FLAGS.SANDBOX_BOX_LOGS_FLEET, "sandbox-fleet", {
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	if (fleet !== true) return false;
	const organization = await flags
		.isFeatureEnabled(FEATURE_FLAGS.SANDBOX_BOX_LOGS, organizationId, {
			groups: { organization: organizationId },
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	return organization === true;
}
