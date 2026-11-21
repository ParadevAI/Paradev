import type { CaptureResult } from "posthog-js";

import { stripAuthProviderReferrer } from "./auth-provider-referrer";

const URL_PROPERTIES = [
	"$current_url",
	"$initial_current_url",
	"$session_entry_url",
	"$referrer",
	"$initial_referrer",
	"$session_entry_referrer",
] as const;

function stripInvitationToken(value: unknown): unknown {
	if (typeof value !== "string") return value;
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return value;
	}
	if (
		!url.pathname.startsWith("/accept-invitation/") ||
		!url.searchParams.has("token")
	) {
		return value;
	}
	url.searchParams.delete("token");
	return url.toString();
}

export function sanitizePosthogEvent(
	event: CaptureResult | null,
): CaptureResult | null {
	if (!event) return event;
	for (const properties of [
		event.properties,
		event.$set,
		event.$set_once,
		event.properties.$set,
		event.properties.$set_once,
	]) {
		if (!properties || typeof properties !== "object") continue;
		for (const key of URL_PROPERTIES) {
			if (key in properties) {
				properties[key] = stripInvitationToken(properties[key]);
			}
		}
	}
	return stripAuthProviderReferrer(event);
}
