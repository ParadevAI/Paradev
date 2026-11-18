import { FEATURE_FLAGS } from "@superset/shared/constants";
import { sandboxAgentToolsDrive } from "@superset/shared/sandbox/contract";
import type { PostHog } from "posthog-node";
import { organizationFlagEnabled } from "./feature-flags";

/** The drive of the bundle the box boots, or null while the organization's flag is off. */
export async function agentToolsDriveFor(args: {
	flags: Pick<PostHog, "isFeatureEnabled">;
	organizationId: string;
	region: string;
	bundleSha: string;
}): Promise<string | null> {
	if (
		!(await organizationFlagEnabled(
			args.flags,
			FEATURE_FLAGS.SANDBOX_AGENT_TOOLS_DRIVE,
			args.organizationId,
		))
	)
		return null;
	return sandboxAgentToolsDrive(args.region, args.bundleSha);
}
