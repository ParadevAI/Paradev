import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";

/**
 * Whether the visitor declined analytics. Shared by every ad pixel so a
 * consent-policy change applies to all of them. Fails closed: if the stored
 * choice can't be read (e.g. storage blocked), treat it as declined.
 */
export function hasDeclinedAnalytics(): boolean {
	try {
		return window.localStorage?.getItem(ANALYTICS_CONSENT_KEY) === "declined";
	} catch (error) {
		console.warn("Could not read analytics consent; skipping ad pixels", error);
		return true;
	}
}
