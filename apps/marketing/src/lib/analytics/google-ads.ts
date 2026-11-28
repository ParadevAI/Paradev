import { canTrack } from "./consent";

declare global {
	interface Window {
		gtag?: (...args: unknown[]) => void;
	}
}

/** Google Ads "Download click (paradev.com)" conversion action. */
export const GOOGLE_ADS_DOWNLOAD_CONVERSION =
	"AW-18209336001/XAEwCNPrxrQdEMHV8epD";

/**
 * Report a conversion to Google Ads through the gtag.js tag loaded by
 * AdTrackers. No-ops on the server, before `window.gtag` exists, or while
 * consent does not allow tracking.
 */
export function trackGoogleAdsConversion(sendTo: string): void {
	if (
		typeof window === "undefined" ||
		typeof window.gtag !== "function" ||
		!canTrack()
	) {
		return;
	}

	// Best-effort: a throw from the third-party tag must never escape into the
	// caller (e.g. a download click handler that navigates right after).
	try {
		window.gtag("event", "conversion", {
			send_to: sendTo,
			value: 1.0,
			currency: "USD",
		});
	} catch (error) {
		console.warn("Google Ads conversion failed", error);
	}
}
