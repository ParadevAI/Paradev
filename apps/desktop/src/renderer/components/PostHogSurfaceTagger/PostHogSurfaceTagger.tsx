import { useEffect } from "react";
import { authClient } from "renderer/lib/auth-client";
import { posthog } from "renderer/lib/posthog";
import { postHogIdentity } from "renderer/lib/posthog-identity";

export function PostHogSurfaceTagger() {
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id;

	useEffect(() => {
		posthog.register({ surface: "v2", surface_source: "opted-in" });

		if (!userId) return;

		postHogIdentity.setPeople({ surface: "v2" });
		postHogIdentity.setPeopleOnce({ onboarded_surface: "v2" });
		postHogIdentity.setPeopleOnce({
			surface_first_v2_at: new Date().toISOString(),
			surface_ever_v2: true,
		});
	}, [userId]);

	return null;
}
