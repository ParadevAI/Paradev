import { FEATURE_FLAGS } from "@superset/shared/constants";
import { sandboxAgentToolsDrive } from "@superset/shared/sandbox/contract";
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

/** The drive of the bundle the box boots, or null while the organization's flag is off. */
export async function agentToolsDriveFor(args: {
	organizationId: string;
	region: string;
	bundleSha: string;
}): Promise<string | null> {
	if (!(await agentToolsDriveEnabled(args.organizationId))) return null;
	return sandboxAgentToolsDrive(args.region, args.bundleSha);
}
