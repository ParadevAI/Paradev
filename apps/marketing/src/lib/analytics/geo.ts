export type Geo = {
	country: string | null;
	region: string | null;
	city: string | null;
};

type ServerTimingEntry = { name: string; description: string };

const COUNTRY = /^[A-Z]{2}$/;
const REGION = /^[A-Z0-9]{1,3}$/;
const CITY = /^[^\p{C}"\\]{1,64}$/u;

const ENTRY = {
	country: "geo-country",
	region: "geo-region",
	city: "geo-city",
} as const;

function decode(value: string | null | undefined): string | null {
	if (!value) return null;
	try {
		return decodeURIComponent(value);
	} catch {
		return null;
	}
}

function valid(pattern: RegExp, value: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed && pattern.test(trimmed) ? trimmed : null;
}

/** Country, region and city from URL-encoded values, each dropped unless it is a valid code or a short printable name. */
export function parseGeo(raw: {
	country?: string | null;
	region?: string | null;
	city?: string | null;
}): Geo {
	return {
		country: valid(COUNTRY, raw.country?.toUpperCase() ?? null),
		region: valid(REGION, raw.region?.toUpperCase() ?? null),
		city: valid(CITY, decode(raw.city)),
	};
}

export function geoFromRequestHeaders(headers: Headers): Geo {
	return parseGeo({
		country: headers.get("x-vercel-ip-country"),
		region: headers.get("x-vercel-ip-country-region"),
		city: headers.get("x-vercel-ip-city"),
	});
}

export function geoServerTiming(geo: Geo): string | null {
	const entries = (Object.keys(ENTRY) as (keyof Geo)[]).flatMap((key) => {
		const value = geo[key];
		return value ? [`${ENTRY[key]};desc="${encodeURIComponent(value)}"`] : [];
	});
	return entries.length > 0 ? entries.join(", ") : null;
}

export function geoFromServerTiming(
	entries: readonly ServerTimingEntry[],
): Geo {
	const read = (name: string) =>
		entries.find((entry) => entry.name === name)?.description;
	return parseGeo({
		country: read(ENTRY.country),
		region: read(ENTRY.region),
		city: read(ENTRY.city),
	});
}

export function geoProperties(geo: Geo): Record<string, string> {
	const properties: Record<string, string> = {};
	if (geo.country) properties.$geoip_country_code = geo.country;
	if (geo.region) properties.$geoip_subdivision_1_code = geo.region;
	if (geo.city) properties.$geoip_city_name = geo.city;
	return properties;
}

/** Geo the proxy put on this document's Server-Timing header. */
export function readDocumentGeo(): Geo {
	const [navigation] = performance.getEntriesByType("navigation") as
		| PerformanceNavigationTiming[]
		| [];
	return geoFromServerTiming(navigation?.serverTiming ?? []);
}
