import { describe, expect, test } from "bun:test";
import {
	applyMarketingPersonProperties,
	enrichMarketingAttribution,
	MARKETING_CAMPAIGN_PARAMS,
	MARKETING_TOUCH_PROPERTY,
	marketingPersonProperties,
	marketingTouchFromPage,
	readMarketingTouch,
} from "./marketing-attribution";

function client() {
	const properties: Record<string, unknown> = {};
	const events: { event: string; properties: Record<string, unknown> }[] = [];
	return {
		properties,
		events,
		declined: false,
		get_property(key: string) {
			return properties[key];
		},
		register(values: Record<string, unknown>) {
			Object.assign(properties, values);
		},
		unregister(key: string) {
			delete properties[key];
		},
		has_opted_out_capturing() {
			return this.declined;
		},
		capture(event: string, properties: Record<string, unknown>) {
			const enriched = enrichMarketingAttribution({ event, properties }, this);
			if (enriched) events.push(enriched);
		},
	};
}
function page(url: string, referrer = "") {
	return {
		event: "$pageview",
		properties: { $current_url: url, $referrer: referrer } as Record<
			string,
			unknown
		>,
	};
}

describe("marketing attribution", () => {
	test("retains latest website campaign and click IDs for an existing-account login without setting first touch", () => {
		const sdk = client();
		enrichMarketingAttribution(
			page(
				"https://paradev.com/?utm_source=google&utm_campaign=A&gclid=click-A&utm_id=123&device=c",
			),
			sdk,
		);
		const sharedCookie = structuredClone(sdk.properties);
		const app = client();
		app.register(sharedCookie);
		enrichMarketingAttribution(
			page("https://app.paradev.com/sign-in", "https://paradev.com/"),
			app,
		);
		applyMarketingPersonProperties(app);
		expect(app.events[0]?.event).toBe("$set");
		expect(app.events[0]?.properties.$set).toMatchObject({
			utm_source: "google",
			gclid: "click-A",
			utm_id: "123",
			device: "c",
		});
		expect(
			Object.keys(app.events[0]?.properties.$set as object).some((key) =>
				key.startsWith("$initial_"),
			),
		).toBe(false);
	});

	test("replaces the entire campaign, clearing IDs and tags absent from a second touch", () => {
		const sdk = client();
		enrichMarketingAttribution(
			page(
				"https://paradev.com/?utm_source=google&gclid=A&utm_term=old&device=c",
			),
			sdk,
		);
		const next = enrichMarketingAttribution(
			page(
				"https://paradev.com/?utm_source=newsletter&utm_campaign=B&mc_cid=B",
			),
			sdk,
		);
		expect(next?.properties).toMatchObject({
			utm_source: "newsletter",
			utm_campaign: "B",
			mc_cid: "B",
			gclid: null,
			utm_term: null,
			device: null,
		});
		applyMarketingPersonProperties(sdk);
		expect(sdk.events[0]?.properties.$set).toMatchObject({
			gclid: null,
			utm_term: null,
		});
	});

	test("direct, internal, and OAuth hops leave the retained touch unchanged", () => {
		const sdk = client();
		enrichMarketingAttribution(
			page("https://paradev.com/?wbraid=braid&gbraid=other&utm_campaign=paid"),
			sdk,
		);
		const before = structuredClone(sdk.properties);
		for (const referrer of [
			"",
			"https://paradev.com/",
			"https://docs.paradev.com/",
			"https://app.superset.sh/",
			"https://accounts.google.com/",
			"https://github.com/login/oauth",
		]) {
			enrichMarketingAttribution(
				page(
					"https://app.paradev.com/?code=secret&state=secret#secret",
					referrer,
				),
				sdk,
			);
		}
		expect(sdk.properties).toEqual(before);
	});

	test("captures an external organic referral without carrying old paid identifiers", () => {
		const sdk = client();
		enrichMarketingAttribution(page("https://paradev.com/?gclid=old"), sdk);
		const nextDocument = client();
		nextDocument.register(sdk.properties);
		enrichMarketingAttribution(
			page(
				"https://paradev.com/blog",
				"https://www.google.com/search?q=private",
			),
			nextDocument,
		);
		const touch = readMarketingTouch(
			nextDocument.get_property(MARKETING_TOUCH_PROPERTY),
		);
		expect(touch?.referrer).toBe("https://www.google.com");
		if (!touch) throw new Error("Missing organic touch");
		expect(marketingPersonProperties(touch)).toMatchObject({
			gclid: null,
			marketing_landing_url: "https://paradev.com/blog",
		});
	});

	test("allowlists all native campaign identifiers and existing Ads ValueTrack fields only", () => {
		for (const key of MARKETING_CAMPAIGN_PARAMS) {
			const touch = marketingTouchFromPage(
				`https://paradev.com/?${key}=value&code=secret&token=secret&email=private#secret`,
				"",
			);
			expect(touch?.params[key]).toBe("value");
			expect(JSON.stringify(touch)).not.toContain("secret");
			expect(touch?.landing).toBe("https://paradev.com/");
		}
	});

	test("rejects oversized, invalid and credential-bearing payloads rather than truncating or mixing them", () => {
		for (const value of ["x".repeat(257), "\u0001invalid", "界".repeat(200)]) {
			expect(
				marketingTouchFromPage(
					`https://paradev.com/?gclid=${encodeURIComponent(value)}`,
					"",
				),
			).toBeNull();
		}
		expect(
			marketingTouchFromPage(
				"https://name:password@paradev.com/?gclid=abc",
				"",
			),
		).toBeNull();
		expect(
			marketingTouchFromPage(
				"https://app.paradev.com/api/auth/callback?gclid=abc",
				"",
			),
		).toBeNull();
		expect(
			marketingTouchFromPage(
				"https://app.paradev.com/accept-invitation/id?token=secret&utm_source=x",
				"",
			),
		).toBeNull();
		expect(readMarketingTouch({ at: "invalid", params: {} })).toBeNull();
	});

	test("SPA pageviews do not turn a tagged arrival into an untagged external referral", () => {
		const sdk = client();
		enrichMarketingAttribution(
			page(
				"https://paradev.com/?utm_campaign=A&gclid=click",
				"https://www.google.com/",
			),
			sdk,
		);
		const first = structuredClone(sdk.properties);
		enrichMarketingAttribution(
			page("https://paradev.com/pricing", "https://www.google.com/"),
			sdk,
		);
		expect(sdk.properties).toEqual(first);
	});

	test("a new direct tagged document refreshes context even when campaign tags match", () => {
		const sdk = client();
		enrichMarketingAttribution(
			page("https://paradev.com/?utm_campaign=A"),
			sdk,
		);
		const nextDocument = client();
		nextDocument.register(sdk.properties);
		enrichMarketingAttribution(
			page("https://paradev.com/new-landing?utm_campaign=A"),
			nextDocument,
		);
		expect(
			readMarketingTouch(nextDocument.get_property(MARKETING_TOUCH_PROPERTY))
				?.landing,
		).toBe("https://paradev.com/new-landing");
	});

	test("an invalid second campaign clears the previous retained touch instead of miscrediting it", () => {
		const sdk = client();
		enrichMarketingAttribution(
			page("https://paradev.com/?utm_campaign=A&gclid=click"),
			sdk,
		);
		enrichMarketingAttribution(
			page(`https://paradev.com/?utm_campaign=B&gclid=${"x".repeat(257)}`),
			sdk,
		);
		expect(sdk.get_property(MARKETING_TOUCH_PROPERTY)).toBeUndefined();
		applyMarketingPersonProperties(sdk);
		expect(sdk.events).toEqual([]);
	});

	test("decline prevents retention and person updates", () => {
		const sdk = client();
		sdk.declined = true;
		enrichMarketingAttribution(
			page("https://paradev.com/?gclid=declined"),
			sdk,
		);
		applyMarketingPersonProperties(sdk);
		expect(sdk.properties).toEqual({});
		expect(sdk.events).toEqual([]);
	});

	test("native reset on sign-out/account switch removes attribution with the old identity", () => {
		const sdk = client();
		enrichMarketingAttribution(
			page("https://paradev.com/?utm_source=old-user"),
			sdk,
		);
		for (const key of Object.keys(sdk.properties)) delete sdk.properties[key];
		applyMarketingPersonProperties(sdk);
		expect(sdk.events).toEqual([]);
		enrichMarketingAttribution(
			page("https://paradev.com/?utm_source=new-user"),
			sdk,
		);
		applyMarketingPersonProperties(sdk);
		expect(sdk.events[0]?.properties.$set).toMatchObject({
			utm_source: "new-user",
		});
	});
});
