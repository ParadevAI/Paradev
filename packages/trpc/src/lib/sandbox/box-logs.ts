import { FEATURE_FLAGS } from "@superset/shared/constants";
import type { SandboxIdentity } from "@superset/shared/sandbox/contract";
import { posthog } from "../analytics";

/** The one PostHog subject the fleet switch is asked about. */
export const BOX_LOGS_FLEET_SUBJECT = "sandbox-fleet";

async function flagOn(
	flag: string,
	distinctId: string,
	options: { groups?: Record<string, string> } = {},
): Promise<boolean> {
	const enabled = await posthog
		.isFeatureEnabled(flag, distinctId, {
			...options,
			sendFeatureFlagEvents: false,
		})
		.catch(() => undefined);
	return enabled === true;
}

/** Fails closed: both switches must answer true, and PostHog unreachable is off. */
export async function boxLogsIdentity(
	organizationId: string,
): Promise<Pick<SandboxIdentity, "SUPERSET_SANDBOX_BOX_LOGS">> {
	const [fleet, organization] = await Promise.all([
		flagOn(FEATURE_FLAGS.SANDBOX_BOX_LOGS_FLEET, BOX_LOGS_FLEET_SUBJECT),
		flagOn(FEATURE_FLAGS.SANDBOX_BOX_LOGS, organizationId, {
			groups: { organization: organizationId },
		}),
	]);
	return fleet && organization ? { SUPERSET_SANDBOX_BOX_LOGS: "1" } : {};
}
