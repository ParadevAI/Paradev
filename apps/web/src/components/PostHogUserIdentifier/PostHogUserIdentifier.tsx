"use client";

import { authClient } from "@superset/auth/client";
import posthog from "posthog-js";
import { useEffect } from "react";
import { registerBaseProperties } from "@/lib/posthog-client";
import { isStaleIdentity } from "./utils/isStaleIdentity";

export function PostHogUserIdentifier() {
	const { data: session, isPending, error } = authClient.useSession();

	useEffect(() => {
		// `session` is null while loading and can be stale after a failed
		// refresh, so only a settled, successful fetch may change identity.
		if (isPending || error) return;

		const user = session?.user ?? null;
		if (
			isStaleIdentity({
				userId: user?.id ?? null,
				distinctId: posthog.get_distinct_id(),
				userState: posthog.get_property("$user_state"),
			})
		) {
			// reset() drops the super properties with the person; put back the
			// ones every event needs.
			posthog.reset();
			registerBaseProperties();
		}

		if (user) {
			posthog.identify(user.id, {
				email: user.email,
				name: user.name,
			});
		}
	}, [session, isPending, error]);

	return null;
}
