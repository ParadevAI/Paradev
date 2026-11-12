import type { CaptureResult } from "posthog-js";
import { cleanGithubAuthReturnUrl } from "./github-auth-return";

const DIRECT = "$direct";

const AUTH_PROVIDER_HOSTS = [
	/^accounts\.google\.[a-z.]+$/,
	/^accounts\.youtube\.com$/,
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
	githubAuthReturn: boolean,
): void {
	if (!props) return;
	for (const [referrerKey, domainKey] of keys) {
		if (
			isAuthProviderHost(props[domainKey]) ||
			isAuthProviderHost(props[referrerKey]) ||
			(githubAuthReturn &&
				[props[domainKey], props[referrerKey]].some((value) =>
					/^(www\.)?github\.com$/.test(hostOf(value) ?? ""),
				))
		) {
			props[referrerKey] = DIRECT;
			props[domainKey] = DIRECT;
		}
	}
}

/**
 * GitHub hosts acquisition links as well as OAuth. Strip it only on a known
 * auth return; a provider hostname alone cannot distinguish those journeys.
 * The acquisition transport never collects referrers from the auth roundtrip.
 */
function isDesktopReturn(value: unknown): boolean {
	try {
		return new URL(String(value)).pathname === "/auth/desktop/success";
	} catch {
		return false;
	}
}

export function stripAuthProviderReferrer(
	event: CaptureResult | null,
	githubAuthReturn?: string,
): CaptureResult | null {
	if (!event) return event;
	const currentHost = urlHost(event.properties?.$current_url);
	const isGithubReturn =
		!!githubAuthReturn || isDesktopReturn(event.properties?.$current_url);
	const firstTouchUrl =
		event.$set_once?.$initial_current_url ??
		event.properties?.$initial_current_url;
	const firstTouchHost = urlHost(firstTouchUrl);
	const firstTouchIsHere =
		firstTouchHost === null || firstTouchHost === currentHost;
	const firstTouchIsGithubReturn =
		(!!githubAuthReturn && firstTouchUrl === githubAuthReturn) ||
		isDesktopReturn(firstTouchUrl);
	for (const props of [event.properties, event.$set_once]) {
		replaceAuthProviderReferrer(props, CURRENT_REFERRER_KEYS, isGithubReturn);
		if (firstTouchIsHere)
			replaceAuthProviderReferrer(
				props,
				FIRST_TOUCH_KEYS,
				firstTouchIsGithubReturn,
			);
		if (props && githubAuthReturn) {
			for (const key of ["$current_url", "$initial_current_url"]) {
				if (typeof props[key] === "string")
					props[key] = cleanGithubAuthReturnUrl(props[key]);
			}
		}
	}
	return event;
}
