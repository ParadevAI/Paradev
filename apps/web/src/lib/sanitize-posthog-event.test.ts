import { describe, expect, test } from "bun:test";
import type { CaptureResult } from "posthog-js";

import { sanitizePosthogEvent } from "./sanitize-posthog-event";

describe("sanitizePosthogEvent", () => {
	test("removes invitation tokens from event and person URL properties", () => {
		const invitation =
			"https://app.paradev.com/accept-invitation/invite-id?token=secret&token=duplicate&utm_source=email#details";
		const sanitized =
			"https://app.paradev.com/accept-invitation/invite-id?utm_source=email#details";
		const urls = {
			$current_url: invitation,
			$initial_current_url: invitation,
			$session_entry_url: invitation,
			$referrer: invitation,
			$initial_referrer: invitation,
			$session_entry_referrer: invitation,
		};
		const result = sanitizePosthogEvent({
			uuid: "test",
			event: "$pageview",
			properties: { ...urls, $set: { ...urls }, $set_once: { ...urls } },
			$set: { ...urls },
			$set_once: { ...urls },
		} as CaptureResult);
		for (const properties of [
			result?.properties,
			result?.$set,
			result?.$set_once,
			result?.properties.$set,
			result?.properties.$set_once,
		]) {
			for (const key of Object.keys(urls)) {
				expect(properties[key]).toBe(sanitized);
			}
		}
	});

	test("preserves unrelated values and URLs without invitation tokens", () => {
		const properties = {
			$current_url:
				"https://app.superset.sh/accept-invitation/id?utm_source=email",
			$initial_current_url: "https://paradev.com/?utm_source=email",
			$referrer: "$direct",
			$session_entry_url: "not a URL",
			$initial_referrer: null,
			app_name: "web",
		};
		const result = sanitizePosthogEvent({
			uuid: "test",
			event: "$pageview",
			properties: { ...properties },
		} as CaptureResult);
		expect(result?.properties).toEqual(properties);
	});

	test("keeps OAuth referrer handling and marketing first-touch attribution", () => {
		const result = sanitizePosthogEvent({
			uuid: "test",
			event: "$pageview",
			properties: {
				$current_url:
					"https://app.superset.sh/accept-invitation/id?token=secret",
				$referrer: "https://accounts.google.com/",
				$referring_domain: "accounts.google.com",
			},
			$set_once: {
				$initial_current_url: "https://paradev.com/?utm_source=newsletter",
				$initial_referrer: "https://github.com/ParadevAI/Paradev",
				$initial_referring_domain: "github.com",
			},
		} as CaptureResult);
		expect(result?.properties).toMatchObject({
			$current_url: "https://app.superset.sh/accept-invitation/id",
			$referrer: "$direct",
			$referring_domain: "$direct",
		});
		expect(result?.$set_once).toEqual({
			$initial_current_url: "https://paradev.com/?utm_source=newsletter",
			$initial_referrer: "https://github.com/ParadevAI/Paradev",
			$initial_referring_domain: "github.com",
		});
	});

	test("preserves dropped events", () => {
		expect(sanitizePosthogEvent(null)).toBeNull();
	});
});
