import { expect, test } from "bun:test";

import { geoFromServerTiming, geoProperties, parseGeo } from "./geo";

test("keeps valid location values and drops anything else", () => {
	expect(
		parseGeo({ country: "de", region: "by", city: "S%C3%A3o%20Paulo" }),
	).toEqual({ country: "DE", region: "BY", city: "São Paulo" });
	expect(
		parseGeo({
			country: "DEU",
			region: "BAYE",
			city: "%22%3Cscript%3E%22",
		}),
	).toEqual({ country: null, region: null, city: null });
	expect(parseGeo({ city: "a%0Ab" }).city).toBeNull();
	expect(parseGeo({ city: "%E0%A4%A" }).city).toBeNull();
	expect(parseGeo({ city: "x".repeat(65) }).city).toBeNull();
});

test("reads location from Server-Timing into PostHog geo properties only", () => {
	const geo = geoFromServerTiming([
		{ name: "geo-country", description: "JP" },
		{ name: "geo-region", description: "13" },
		{ name: "geo-city", description: "T%C5%8Dky%C5%8D" },
		{ name: "geo-postal", description: "100-0001" },
	]);
	expect(geoProperties(geo)).toEqual({
		$geoip_country_code: "JP",
		$geoip_subdivision_1_code: "13",
		$geoip_city_name: "Tōkyō",
	});
	expect(geoProperties(geoFromServerTiming([]))).toEqual({});
});
