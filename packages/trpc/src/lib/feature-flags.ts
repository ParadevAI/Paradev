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
