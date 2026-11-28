import type { PostHog } from "posthog-js";

import {
	hasCookielessAnalytics,
	hasLoadedTracker,
	saveConsentChoice,
} from "./consent";
import { withPosthog } from "./lazy";

/**
 * The PostHog cookie is shared with app.superset.sh, which identifies the
 * visitor at sign-in. A visitor who declined gets a fresh anonymous id, so
 * nothing recorded before the decline (visits, referrer, UTM) joins their
 * account. reset(true) also rotates the device id, which events carry too.
 * reset() clears the opt-out, so it must run first. Disabling persistence
 * then deletes the cookie that holds the fresh id.
 */
export function declineAnalytics(
	posthog: Pick<
		PostHog,
		"get_property" | "reset" | "opt_out_capturing" | "set_config"
	>,
): void {
	const identified = posthog.get_property("$user_state") === "identified";
	if (!identified) posthog.reset(true);
	posthog.opt_out_capturing();
	if (!identified) posthog.set_config({ disable_persistence: true });
}

/** Loaded trackers have no teardown API; a reload discards them. */
export function declineTracking(
	reload: () => void = () => window.location.reload(),
): void {
	withPosthog(declineAnalytics);
	saveConsentChoice("declined");
	if (hasLoadedTracker()) reload();
}

/** Cookieless PostHog cannot switch to cookies in place; a reload starts it again with consent. */
export function acceptTracking(
	reload: () => void = () => window.location.reload(),
): void {
	saveConsentChoice("accepted");
	if (hasCookielessAnalytics()) {
		reload();
		return;
	}
	withPosthog((posthog) => posthog.opt_in_capturing());
}
