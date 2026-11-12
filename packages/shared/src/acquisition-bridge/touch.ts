export const CAMPAIGN_KEYS = [
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_content",
	"utm_term",
	"utm_id",
] as const;
export const CLICK_KEYS = [
	"gclid",
	"dclid",
	"gbraid",
	"wbraid",
	"msclkid",
	"fbclid",
	"ttclid",
	"twclid",
] as const;
export type TouchSnapshot = Partial<
	Record<(typeof CAMPAIGN_KEYS)[number] | (typeof CLICK_KEYS)[number], string>
> & {
	landing_pathname: string;
	referrer_host?: string;
};
export type AcquisitionTouch = TouchSnapshot & { timestamp: string };
export type TrackingState = "enabled" | "disabled";
export type TouchOptions = { internalOrigins?: readonly string[] };

function safePath(value: unknown): value is string {
	return (
		typeof value === "string" &&
		value.length <= 1024 &&
		/^\/(?!\/)[A-Za-z0-9_./~-]*$/.test(value) &&
		!value.split("/").some((part) => part === "." || part === "..")
	);
}

function externalHost(
	value: unknown,
	options: TouchOptions,
): string | undefined {
	if (typeof value !== "string" || value.length > 253) return;
	const host = value.toLowerCase();
	if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) return;
	const internal = [
		"paradev.com",
		"superset.sh",
		"accounts.google.com",
		...(options.internalOrigins ?? []).flatMap((origin) => {
			try {
				return [new URL(origin).hostname];
			} catch {
				return [];
			}
		}),
	];
	if (internal.some((domain) => host === domain || host.endsWith(`.${domain}`)))
		return;
	return host;
}

export function sanitizeTouchSnapshot(
	input: unknown,
	options: TouchOptions = {},
): TouchSnapshot | null {
	if (!input || typeof input !== "object" || Array.isArray(input)) return null;
	const raw = input as Record<string, unknown>;
	if (!safePath(raw.landing_pathname)) return null;
	const touch: TouchSnapshot = { landing_pathname: raw.landing_pathname };
	for (const key of CAMPAIGN_KEYS) {
		const value = raw[key];
		if (
			typeof value === "string" &&
			value.length <= 128 &&
			/^[\p{L}\p{N}][\p{L}\p{N} ._~+():/-]*$/u.test(value)
		)
			touch[key] = value;
	}
	for (const key of CLICK_KEYS) {
		const value = raw[key];
		if (typeof value === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value))
			touch[key] = value;
	}
	const host = externalHost(raw.referrer_host, options);
	if (host) touch.referrer_host = host;
	return touch;
}

export function collectTouchSnapshot(
	input: { href: string; referrer?: string },
	options: TouchOptions = {},
): TouchSnapshot | null {
	try {
		const url = new URL(input.href);
		if (!/^https?:$/.test(url.protocol)) return null;
		const raw: Record<string, unknown> = { landing_pathname: url.pathname };
		for (const key of [...CAMPAIGN_KEYS, ...CLICK_KEYS])
			raw[key] = url.searchParams.get(key);
		if (input.referrer) {
			const referrer = new URL(input.referrer);
			if (/^https?:$/.test(referrer.protocol))
				raw.referrer_host = referrer.hostname;
		}
		return sanitizeTouchSnapshot(raw, options);
	} catch {
		return null;
	}
}

export function isNonDirectTouch(touch: TouchSnapshot): boolean {
	return (
		!!touch.referrer_host ||
		[...CAMPAIGN_KEYS, ...CLICK_KEYS].some((key) => !!touch[key])
	);
}
