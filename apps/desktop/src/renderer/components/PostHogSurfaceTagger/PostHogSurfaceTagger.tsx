import { useEffect } from "react";
import { authClient } from "renderer/lib/auth-client";
import { posthog } from "renderer/lib/posthog";

export function PostHogSurfaceTagger() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	useEffect(() => {
		posthog.register({ surface: "v2", surface_source: "opted-in" });

		if (!userId) return;

		posthog.people.set({ surface: "v2" });
		posthog.people.set_once({ onboarded_surface: "v2" });
		posthog.people.set_once({
			surface_first_v2_at: new Date().toISOString(),
			surface_ever_v2: true,
		});
	}, [userId]);

	return null;
}
