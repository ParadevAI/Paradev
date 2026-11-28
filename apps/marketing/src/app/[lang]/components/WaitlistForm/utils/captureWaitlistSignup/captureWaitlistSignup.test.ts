import { describe, expect, test } from "bun:test";
import { captureWaitlistSignup } from "./captureWaitlistSignup";

type SentEvent = {
	event: string;
	distinct_id: string;
	properties: Record<string, unknown>;
};

function fakePosthog(status = 200) {
	const requests: { url: string; events: SentEvent[] }[] = [];
	return {
		requests,
		fetch: async (url: string, options: { body?: unknown }) => {
			const body = JSON.parse(String(options.body)) as { batch: SentEvent[] };
			requests.push({ url, events: body.batch });
			return {
				status,
				text: async () => "",
				json: async () => ({}),
			};
		},
	};
}

describe("captureWaitlistSignup", () => {
	test("sends email and platform under a new id each time, without a person profile", async () => {
		const posthog = fakePosthog();
		const options = {
			apiKey: "phc_test",
			host: "https://ph.example.test",
			fetch: posthog.fetch,
		};
		await captureWaitlistSignup("visitor@example.com", options);
		await captureWaitlistSignup("visitor@example.com", options);

		expect(posthog.requests.map((request) => request.url)).toEqual([
			"https://ph.example.test/batch/",
			"https://ph.example.test/batch/",
		]);
		const [first, second] = posthog.requests.map(
			(request) => request.events[0] as SentEvent,
		);
		expect(first?.event).toBe("waitlist_signup");
		expect(first?.properties).toMatchObject({
			email: "visitor@example.com",
			platform: "windows_linux",
			$process_person_profile: false,
		});
		expect(first?.properties).not.toHaveProperty("$ip");
		expect(first?.distinct_id).not.toBe(second?.distinct_id);
	});

	test("rejects when PostHog does not accept the event", async () => {
		const posthog = fakePosthog(503);
		await expect(
			captureWaitlistSignup("visitor@example.com", {
				apiKey: "phc_test",
				host: "https://ph.example.test",
				fetch: posthog.fetch,
				fetchRetryCount: 0,
			}),
		).rejects.toThrow();
	});
});
