import type { CaptureResult } from "posthog-js";

const DIRECT = "$direct";

const AUTH_PROVIDER_HOSTS = [
	/^accounts\.google\.[a-z.]+$/,
	/^accounts\.youtube\.com$/,
	/^(www\.)?github\.com$/,
	/^appleid\.apple\.com$/,
];

const CURRENT_REFERRER_KEYS = [
	["$referrer", "$referring_domain"],
	["$session_entry_referrer", "$session_entry_referring_domain"],
] as const;

const FIRST_TOUCH_KEYS = [
	["$initial_referrer", "$initial_referring_domain"],
] as const;

function hostOf(value: unknown): string | null {
	if (typeof value !== "string" || value === DIRECT) return null;
	try {
		return new URL(value).hostname;
	} catch {
		return value;
	}
}

export function isAuthProviderHost(value: unknown): boolean {
	const host = hostOf(value);
	return host !== null && AUTH_PROVIDER_HOSTS.some((re) => re.test(host));
}

function urlHost(value: unknown): string | null {
	if (typeof value !== "string") return null;
	try {
		return new URL(value).hostname;
	} catch {
		return null;
	}
}

function replaceAuthProviderReferrer(
	props: Record<string, unknown> | undefined,
	keys: ReadonlyArray<readonly [string, string]>,
): void {
	if (!props) return;
	for (const [referrerKey, domainKey] of keys) {
		if (
			isAuthProviderHost(props[domainKey]) ||
			isAuthProviderHost(props[referrerKey])
		) {
			props[referrerKey] = DIRECT;
			props[domainKey] = DIRECT;
		}
	}
}

/**
 * The web app is where OAuth providers send people back, so a provider host
 * as referrer is the sign-in round trip, not where the visitor came from.
 * PostHog derives the person's first-touch properties from these fields.
 * A first touch recorded on another host (the marketing site shares the
 * cookie) is a real arrival, so it is kept.
 */
export function stripAuthProviderReferrer(
	event: CaptureResult | null,
): CaptureResult | null {
	if (!event) return event;
	const currentHost = urlHost(event.properties?.$current_url);
	const firstTouchHost = urlHost(
		event.$set_once?.$initial_current_url ??
			event.properties?.$initial_current_url,
	);
	const firstTouchIsHere =
		firstTouchHost === null || firstTouchHost === currentHost;
	for (const props of [event.properties, event.$set_once]) {
		replaceAuthProviderReferrer(props, CURRENT_REFERRER_KEYS);
		if (firstTouchIsHere) replaceAuthProviderReferrer(props, FIRST_TOUCH_KEYS);
	}
	return event;
}
