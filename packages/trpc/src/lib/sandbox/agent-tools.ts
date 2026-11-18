import { FEATURE_FLAGS } from "@superset/shared/constants";
import { posthog } from "../analytics";

/** Fails closed: PostHog unreachable means no drive. */
export async function agentToolsDriveEnabled(
	organizationId: string,
): Promise<boolean> {
	const enabled = await posthog
		.isFeatureEnabled(FEATURE_FLAGS.SANDBOX_AGENT_TOOLS_DRIVE, organizationId, {
			groups: { organization: organizationId },
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	return enabled === true;
}
