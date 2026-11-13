import { hasDeclinedAnalytics } from "./consent";

type Fetch = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export function createConsentAwareTrackingFetch(
	fetch: Fetch,
	hasDeclined = hasDeclinedAnalytics,
): Fetch {
	return async (input, init) => {
		const url = new URL(
			input instanceof Request ? input.url : String(input),
			window.location.href,
		);
		if (
			url.origin === "https://backend.leadconnectorhq.com" &&
			url.pathname === "/external-tracking/events" &&
			hasDeclined()
		) {
			// The vendor also sends queued forms and unload timing through fetch.
			return new Response(null, { status: 204 });
		}
		return fetch(input, init);
	};
}

let installed = false;

export function installExternalTrackingConsentGuard(): void {
	if (installed) return;
	installed = true;
	window.fetch = Object.assign(
		createConsentAwareTrackingFetch(window.fetch.bind(window)),
		window.fetch,
	);
}
