import { hasAnalyticsOptOut } from "./acquisition-bridge/browser";

export const ANALYTICS_CONSENT_KEY = "superset-analytics-consent";
export const ANALYTICS_CONSENT_PATH = "/api/analytics/consent";
export const ANALYTICS_CONSENT_MESSAGE = "superset:analytics-opt-out";
export const POSTHOG_CONSENT_CONFIG = {
	opt_out_capturing_persistence_type: "cookie",
} as const;

export function migrateAnalyticsOptOut(
	consentKey: string,
	posthogKey: string,
	optedOut = hasAnalyticsOptOut(consentKey, posthogKey),
): boolean {
	if (optedOut) {
		const hostname = window.location.hostname;
		const domain = ["paradev.com", "superset.sh"].find(
			(root) => hostname === root || hostname.endsWith(`.${root}`),
		);
		// biome-ignore lint/suspicious/noDocumentCookie: SDK consent migration must finish before synchronous initialization.
		document.cookie = `__ph_opt_in_out_${posthogKey}=0; Path=/; Max-Age=31536000; SameSite=Lax${domain ? `; Domain=${domain}` : ""}${window.location.protocol === "https:" ? "; Secure" : ""}`;
	}
	return optedOut;
}

export function readMarketingAnalyticsOptOut(
	marketingOrigin: string,
	timeoutMs = 1500,
): Promise<boolean | null> {
	return new Promise((resolve) => {
		const frame = document.createElement("iframe");
		frame.hidden = true;
		frame.title = "Analytics preference";
		frame.referrerPolicy = "no-referrer";
		const finish = (value: boolean | null) => {
			clearTimeout(timer);
			window.removeEventListener("message", receive);
			frame.remove();
			resolve(value);
		};
		const receive = (event: MessageEvent) => {
			if (
				event.origin === marketingOrigin &&
				event.source === frame.contentWindow &&
				event.data?.type === ANALYTICS_CONSENT_MESSAGE &&
				typeof event.data.optedOut === "boolean"
			) {
				finish(event.data.optedOut);
			}
		};
		const timer = setTimeout(() => finish(null), timeoutMs);
		window.addEventListener("message", receive);
		frame.onerror = () => finish(null);
		frame.src = new URL(ANALYTICS_CONSENT_PATH, marketingOrigin).href;
		document.body.append(frame);
	});
}

export function analyticsConsentResponse(options: {
	consentKey: string;
	posthogKey: string;
	docsOrigin: string;
}): Response {
	const literal = (value: string) =>
		JSON.stringify(value).replaceAll("<", "\\u003c");
	const nonce = crypto.randomUUID();
	const script = `parent.postMessage({type:${literal(ANALYTICS_CONSENT_MESSAGE)},optedOut:(${hasAnalyticsOptOut.toString()})(${literal(options.consentKey)},${literal(options.posthogKey)})},${literal(options.docsOrigin)})`;
	return new Response(
		`<!doctype html><html><head><meta charset="utf-8"></head><body><script nonce="${nonce}">${script}</script></body></html>`,
		{
			headers: {
				"Content-Type": "text/html; charset=utf-8",
				"Cache-Control": "no-store",
				"Referrer-Policy": "no-referrer",
				"Content-Security-Policy": `default-src 'none'; base-uri 'none'; frame-ancestors ${options.docsOrigin}; script-src 'nonce-${nonce}'`,
			},
		},
	);
}
