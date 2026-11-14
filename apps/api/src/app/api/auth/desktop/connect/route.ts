import { auth } from "@superset/auth/server";
import { env } from "@/env";
import { desktopConnect } from "./desktopConnect";

export function GET(request: Request) {
	return desktopConnect(request, {
		webUrl: env.NEXT_PUBLIC_WEB_URL,
		enabled: env.DOMAIN_MOVE_ENABLED,
		signInSocial: (input) => auth.api.signInSocial(input),
		lookup: async (...args) => {
			const { posthog } = await import("@/lib/analytics");
			return posthog.getFeatureFlag(...args);
		},
	});
}
