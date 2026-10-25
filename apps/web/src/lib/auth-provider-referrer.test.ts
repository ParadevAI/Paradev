import { describe, expect, test } from "bun:test";
import type { CaptureResult } from "posthog-js";

import {
	isAuthProviderHost,
	stripAuthProviderReferrer,
} from "./auth-provider-referrer";

function event(
	properties: Record<string, unknown>,
	setOnce?: Record<string, unknown>,
): CaptureResult {
	return {
		uuid: "u",
		event: "$pageview",
		properties,
		...(setOnce ? { $set_once: setOnce } : {}),
	} as CaptureResult;
}

describe("isAuthProviderHost", () => {
	test.each([
		"accounts.google.com",
		"accounts.google.co.jp",
		"https://accounts.google.ca/",
		"accounts.youtube.com",
		"github.com",
		"https://github.com/",
		"appleid.apple.com",
	])("%s is an auth provider", (value) => {
		expect(isAuthProviderHost(value)).toBe(true);
	});

	test.each([
		"$direct",
		"www.google.com",
		"https://superset.sh/",
		"superset.sh",
		"docs.github.com",
		"news.ycombinator.com",
		undefined,
		null,
		42,
	])("%s is not an auth provider", (value) => {
		expect(isAuthProviderHost(value)).toBe(false);
	});
});

describe("stripAuthProviderReferrer", () => {
	test("replaces a provider referrer on the event and first touch", () => {
		const result = stripAuthProviderReferrer(
			event(
				{
					$referrer: "https://accounts.google.com/",
					$referring_domain: "accounts.google.com",
					$current_url: "https://app.superset.sh/auth/desktop/success",
				},
				{
					$initial_referrer: "https://github.com/",
					$initial_referring_domain: "github.com",
					$initial_current_url: "https://app.superset.sh/auth/desktop/success",
				},
			),
		);
		expect(result?.properties).toMatchObject({
			$referrer: "$direct",
			$referring_domain: "$direct",
			$current_url: "https://app.superset.sh/auth/desktop/success",
		});
		expect(result?.$set_once).toMatchObject({
			$initial_referrer: "$direct",
			$initial_referring_domain: "$direct",
			$initial_current_url: "https://app.superset.sh/auth/desktop/success",
		});
	});

	test("keeps a first touch carried over from the marketing site", () => {
		const setOnce = {
			$initial_referrer: "https://www.google.com/",
			$initial_referring_domain: "www.google.com",
			$initial_utm_source: "newsletter",
			$initial_current_url: "https://superset.sh/?utm_source=newsletter",
		};
		const result = stripAuthProviderReferrer(
			event(
				{
					$referrer: "https://github.com/",
					$referring_domain: "github.com",
				},
				{ ...setOnce },
			),
		);
		expect(result?.$set_once).toEqual(setOnce);
		expect(result?.properties.$referring_domain).toBe("$direct");
	});

	test("keeps a GitHub first touch that landed on the marketing site", () => {
		const setOnce = {
			$initial_referrer: "https://github.com/superset-sh/superset",
			$initial_referring_domain: "github.com",
			$initial_current_url: "https://superset.sh/",
		};
		const result = stripAuthProviderReferrer(
			event(
				{
					$referrer: "https://github.com/",
					$referring_domain: "github.com",
					$current_url: "https://app.superset.sh/auth/desktop/success",
				},
				{ ...setOnce },
			),
		);
		expect(result?.$set_once).toEqual(setOnce);
		expect(result?.properties.$referring_domain).toBe("$direct");
	});

	test("replaces a provider session-entry referrer", () => {
		const result = stripAuthProviderReferrer(
			event({
				$session_entry_referrer: "https://accounts.google.com/",
				$session_entry_referring_domain: "accounts.google.com",
				$current_url: "https://app.superset.sh/",
			}),
		);
		expect(result?.properties).toMatchObject({
			$session_entry_referrer: "$direct",
			$session_entry_referring_domain: "$direct",
		});
	});

	test("leaves other referrers and missing $set_once alone", () => {
		const result = stripAuthProviderReferrer(
			event({
				$referrer: "https://news.ycombinator.com/",
				$referring_domain: "news.ycombinator.com",
			}),
		);
		expect(result?.properties.$referring_domain).toBe("news.ycombinator.com");
		expect(result?.$set_once).toBeUndefined();
	});

	test("passes a dropped event through", () => {
		expect(stripAuthProviderReferrer(null)).toBeNull();
	});
});
