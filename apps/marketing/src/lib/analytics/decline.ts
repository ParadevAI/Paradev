import type { PostHog } from "posthog-js";

/**
 * The PostHog cookie is shared with app.superset.sh, which identifies the
 * visitor at sign-in. A visitor who declined gets a fresh anonymous id, so
 * nothing recorded before the decline (visits, referrer, UTM) joins their
 * account. reset(true) also rotates the device id, which events carry too.
 * reset() clears the opt-out, so it must run first.
 */
export function declineAnalytics(
	posthog: Pick<PostHog, "get_property" | "reset" | "opt_out_capturing">,
): void {
	if (posthog.get_property("$user_state") !== "identified") {
		posthog.reset(true);
	}
	posthog.opt_out_capturing();
}
