import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { PostHog } from "posthog-node";

type Flags = Pick<PostHog, "isFeatureEnabled">;

/** Fails closed: an unloaded flag or an unreachable PostHog is off. */
export async function organizationFlagEnabled(
	flags: Flags,
	flag: string,
	organizationId: string,
): Promise<boolean> {
	const enabled = await flags
		.isFeatureEnabled(flag, organizationId, {
			groups: { organization: organizationId },
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	return enabled === true;
}

/** Both switches must be on; the organization's flag is asked only while the fleet switch is. */
export async function boxLogsEnabled(
	flags: Flags,
	organizationId: string,
): Promise<boolean> {
	const fleet = await flags
		.isFeatureEnabled(FEATURE_FLAGS.SANDBOX_BOX_LOGS_FLEET, "sandbox-fleet", {
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	return (
		fleet === true &&
		organizationFlagEnabled(
			flags,
			FEATURE_FLAGS.SANDBOX_BOX_LOGS,
			organizationId,
		)
	);
}
