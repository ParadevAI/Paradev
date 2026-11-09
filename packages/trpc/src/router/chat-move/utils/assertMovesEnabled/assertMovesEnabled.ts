import { FEATURE_FLAGS } from "@superset/shared/constants";
import { TRPCError } from "@trpc/server";
import { posthog } from "../../../../lib/analytics";

/**
 * Refuses a new workspace move unless the person is in `workspace-moves`.
 * Fails closed: PostHog answers undefined when it cannot be reached.
 */
export async function assertMovesEnabled(person: {
	id: string;
	email: string;
}): Promise<void> {
	const enabled = await posthog.isFeatureEnabled(
		FEATURE_FLAGS.WORKSPACE_MOVES,
		person.id,
		{
			personProperties: { email: person.email.toLowerCase() },
			sendFeatureFlagEvents: false,
		},
	);
	if (!enabled) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Moving workspaces is not enabled for this account.",
		});
	}
}
