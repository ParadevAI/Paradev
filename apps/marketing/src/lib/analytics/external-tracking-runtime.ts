import { hasDeclinedAnalytics } from "./consent";
import { createConsentAwareTrackingFetch } from "./external-tracking";
import {
	createExternalTrackingClient,
	EXTERNAL_TRACKING_ENDPOINT,
	type ExternalTrackingForm,
} from "./external-tracking-client";

const RUNTIME_KEY = Symbol.for("paradev.externalTracking");
type TrackingWindow = Window & {
	[RUNTIME_KEY]?: ReturnType<typeof createExternalTrackingClient>;
};

function getClient() {
	return (window as TrackingWindow)[RUNTIME_KEY];
}

export function installExternalTrackingConsentGuard(): void {
	if (getClient()) return;
	const transport = window.fetch.bind(window);
	const client = createExternalTrackingClient({
		hasDeclined: hasDeclinedAnalytics,
		readPage: () => ({
			url: window.location.href,
			path: window.location.pathname,
			title: document.title,
			referrer: document.referrer,
			userAgent: navigator.userAgent,
		}),
		isVisible: () => !document.hidden,
		transport: async (event) => {
			const response = await transport(EXTERNAL_TRACKING_ENDPOINT, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(event),
				keepalive: true,
			});
			if (!response.ok)
				throw new Error(`External tracking returned ${response.status}`);
		},
	});
	(window as TrackingWindow)[RUNTIME_KEY] = client;
	window.fetch = Object.assign(
		createConsentAwareTrackingFetch(
			transport,
			hasDeclinedAnalytics,
			client.initialize,
		),
		window.fetch,
	);
	for (const event of [
		"pointerdown",
		"keydown",
		"scroll",
		"pointermove",
		"touchstart",
	]) {
		window.addEventListener(event, client.activity, { passive: true });
	}
	document.addEventListener("visibilitychange", client.visibilityChanged);
	window.addEventListener("pagehide", client.flush);
	window.addEventListener("pageshow", client.navigate);
}

export function trackExternalPageView(): void {
	getClient()?.navigate();
}

export function trackExternalFormSubmission(
	form: ExternalTrackingForm,
	email: string,
): void {
	if (typeof window === "undefined" || hasDeclinedAnalytics()) return;
	installExternalTrackingConsentGuard();
	getClient()?.submit(form, email);
}
