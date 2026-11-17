import { POSTHOG_COOKIE_NAME } from "./constants";
import { isOwnHost } from "./own-domains";

export const MARKETING_TOUCH_PROPERTY = "marketing_touch";

export const MARKETING_CAMPAIGN_PARAMS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_content",
	"utm_term",
	"utm_id",
	"gad_source",
	"mc_cid",
	"gclid",
	"gclsrc",
	"dclid",
	"gbraid",
	"wbraid",
	"fbclid",
	"msclkid",
	"twclid",
	"li_fat_id",
	"igshid",
	"ttclid",
	"rdt_cid",
	"epik",
	"qclid",
	"sccid",
	"irclid",
	"_kx",
	"matchtype",
	"device",
	"network",
	"geo",
	"assetid",
] as const;

const AUTH_HOST =
	/^(accounts\.google\.[a-z.]+|accounts\.youtube\.com|(www\.)?github\.com|appleid\.apple\.com)$/;
const MAX_TOUCH_BYTES = 1400;

type MarketingTouch = {
	at: string;
	landing: string;
	referrer: string;
	params: Partial<Record<(typeof MARKETING_CAMPAIGN_PARAMS)[number], string>>;
};

type AttributionClient = {
	get_property: (key: string) => unknown;
	register: (properties: Record<string, unknown>) => void;
	unregister: (key: string) => void;
	has_opted_out_capturing: () => boolean;
};

type AttributionEvent = {
	event: string;
	properties: Record<string, unknown>;
};

const seenPageviews = new WeakSet<AttributionClient>();

function httpUrl(value: unknown): URL | null {
	if (typeof value !== "string") return null;
	try {
		const url = new URL(value);
		return /^(https?:)$/.test(url.protocol) && !url.username && !url.password
			? url
			: null;
	} catch {
		return null;
	}
}

function contextUrl(value: unknown): string {
	const url = httpUrl(value);
	return url ? `${url.origin}${url.pathname}` : "";
}

export function readMarketingTouch(value: unknown): MarketingTouch | null {
	if (!value || typeof value !== "object") return null;
	const touch = value as MarketingTouch;
	if (
		typeof touch.at !== "string" ||
		!Number.isFinite(Date.parse(touch.at)) ||
		touch.landing !== contextUrl(touch.landing) ||
		!touch.landing ||
		typeof touch.referrer !== "string" ||
		(touch.referrer !== "" &&
			touch.referrer !== httpUrl(touch.referrer)?.origin) ||
		!touch.params ||
		typeof touch.params !== "object"
	)
		return null;
	const params: MarketingTouch["params"] = {};
	for (const key of MARKETING_CAMPAIGN_PARAMS) {
		const value = touch.params[key];
		if (value === undefined) continue;
		if (
			typeof value !== "string" ||
			!value.trim() ||
			value.length > 256 ||
			Array.from(value).some(
				(character) =>
					character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
			)
		)
			return null;
		params[key] = value;
	}
	const result = {
		at: touch.at,
		landing: touch.landing,
		referrer: touch.referrer,
		params,
	};
	return encodeURIComponent(JSON.stringify(result)).length <= MAX_TOUCH_BYTES
		? result
		: null;
}

export function marketingTouchFromPage(
	urlValue: unknown,
	referrerValue: unknown,
	now = new Date(),
): MarketingTouch | null {
	const url = httpUrl(urlValue);
	if (!url || /\/(api\/auth|accept-invitation)(\/|$)/.test(url.pathname))
		return null;
	const params: MarketingTouch["params"] = {};
	for (const key of MARKETING_CAMPAIGN_PARAMS) {
		const value = url.searchParams.get(key);
		if (value) params[key] = value;
	}
	const referrer = httpUrl(referrerValue);
	const external =
		referrer &&
		!isOwnHost(referrer.hostname) &&
		referrer.hostname !== url.hostname &&
		!AUTH_HOST.test(referrer.hostname);
	if (!Object.keys(params).length && !external) return null;
	return readMarketingTouch({
		at: now.toISOString(),
		landing: contextUrl(url.href),
		referrer: external ? referrer.origin : "",
		params,
	});
}

export function marketingPersonProperties(
	touch: MarketingTouch,
): Record<string, unknown> {
	return {
		...Object.fromEntries(
			MARKETING_CAMPAIGN_PARAMS.map((key) => [key, touch.params[key] ?? null]),
		),
		marketing_landing_url: touch.landing,
		marketing_referrer: touch.referrer || "$direct",
		marketing_touch_at: touch.at,
	};
}

function fitsSharedCookie(touch: MarketingTouch): boolean {
	if (typeof document === "undefined") return true;
	try {
		const prefix = `ph_${POSTHOG_COOKIE_NAME}=`;
		const value = document.cookie
			.split("; ")
			.find((cookie) => cookie.startsWith(prefix));
		const properties = value
			? JSON.parse(decodeURIComponent(value.slice(prefix.length)))
			: {};
		properties[MARKETING_TOUCH_PROPERTY] = touch;
		// Leave room for identify's user ID and email/name flag cache.
		return (
			prefix.length + encodeURIComponent(JSON.stringify(properties)).length <=
			3500
		);
	} catch {
		return false;
	}
}

export function enrichMarketingAttribution<T extends AttributionEvent>(
	event: T | null,
	client: AttributionClient,
): T | null {
	if (!event || client.has_opted_out_capturing()) return event;
	let touch = readMarketingTouch(client.get_property(MARKETING_TOUCH_PROPERTY));
	if (event.event === "$pageview") {
		const firstPageview = !seenPageviews.has(client);
		const referrer = !firstPageview
			? ""
			: typeof document === "undefined"
				? event.properties.$referrer
				: document.referrer;
		seenPageviews.add(client);
		const arrival = marketingTouchFromPage(
			event.properties.$current_url,
			referrer,
		);
		const url = httpUrl(event.properties.$current_url);
		const hasCampaign = MARKETING_CAMPAIGN_PARAMS.some((key) =>
			url?.searchParams.has(key),
		);
		if ((hasCampaign && !arrival) || (arrival && !fitsSharedCookie(arrival))) {
			client.unregister(MARKETING_TOUCH_PROPERTY);
			touch = null;
		} else if (arrival && fitsSharedCookie(arrival)) {
			// A tagged internal handoff is the same arrival, not a new campaign.
			if (
				!touch ||
				JSON.stringify(arrival.params) !== JSON.stringify(touch.params) ||
				arrival.referrer ||
				(firstPageview && !isOwnHost(httpUrl(referrer)?.hostname ?? ""))
			) {
				touch = arrival;
				client.register({ [MARKETING_TOUCH_PROPERTY]: touch });
			}
		}
	}
	if (touch) {
		const properties = marketingPersonProperties(touch);
		event.properties[MARKETING_TOUCH_PROPERTY] = touch;
		Object.assign(event.properties, properties);
		if (event.event === "$set") {
			// before_send runs after the SDK's feature-flag cache update. Keep
			// the shared touch out of that second cookie copy (SDK 1.310.1).
			event.properties.$set = {
				...(event.properties.$set as Record<string, unknown> | undefined),
				...properties,
			};
		}
	} else {
		delete event.properties[MARKETING_TOUCH_PROPERTY];
	}
	return event;
}

export function applyMarketingPersonProperties(
	client: AttributionClient & {
		capture: (event: string, properties: Record<string, unknown>) => unknown;
	},
): void {
	if (client.has_opted_out_capturing()) return;
	const touch = readMarketingTouch(
		client.get_property(MARKETING_TOUCH_PROPERTY),
	);
	if (!touch) return;
	client.capture("$set", {});
}
