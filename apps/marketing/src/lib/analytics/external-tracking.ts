import { hasDeclinedAnalytics } from "./consent";
import {
	EXTERNAL_TRACKING_ID,
	type ExternalTrackingContext,
} from "./external-tracking-client";

type Fetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export function createConsentAwareTrackingFetch(
	fetch: Fetch,
	hasDeclined = hasDeclinedAnalytics,
	onInitialize: (context: ExternalTrackingContext) => void = () => {},
): Fetch {
	return async (input, init) => {
		const url = new URL(
			input instanceof Request ? input.url : String(input),
			window.location.href,
		);
		if (
			url.origin !== "https://backend.leadconnectorhq.com" ||
			url.pathname !== "/external-tracking/events"
		)
			return fetch(input, init);

		// Vendor form capture runs before validation and can include sensitive fields.
		// Use only its initial session and identity context; app events use an allowlist.
		if (!hasDeclined()) {
			try {
				const body =
					init?.body ??
					(input instanceof Request ? await input.clone().text() : null);
				if (typeof body === "string") {
					const event = JSON.parse(body);
					if (
						event?.type === "external_script_page_view" &&
						event.trackingId === EXTERNAL_TRACKING_ID &&
						typeof event.sessionId === "string" &&
						event.sessionId.length > 0
					)
						onInitialize({
							sessionId: event.sessionId,
							contactId:
								typeof event.contactId === "string"
									? event.contactId
									: undefined,
							userId:
								typeof event.userId === "string" ? event.userId : undefined,
							deviceType: ["desktop", "mobile", "tablet"].includes(
								event.properties?.deviceType,
							)
								? event.properties.deviceType
								: undefined,
						});
				}
			} catch {
				return new Response(null, { status: 204 });
			}
		}
		return new Response(null, { status: 204 });
	};
}
