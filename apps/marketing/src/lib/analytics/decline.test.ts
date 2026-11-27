import { afterEach, describe, expect, test } from "bun:test";

import { canTrack, markTrackerLoaded } from "./consent";
import { declineAnalytics, declineTracking } from "./decline";

function fakePosthog(userState: string | undefined) {
	const calls: string[] = [];
	return {
		calls,
		posthog: {
			get_property: (key: string) =>
				key === "$user_state" ? userState : undefined,
			reset: (resetDeviceId?: boolean) => {
				calls.push(resetDeviceId ? "reset(device)" : "reset");
			},
			opt_out_capturing: () => {
				calls.push("opt_out_capturing");
			},
		},
	};
}

describe("declineAnalytics", () => {
	test("drops the anonymous visitor before opting out", () => {
		const { calls, posthog } = fakePosthog("anonymous");
		declineAnalytics(posthog);
		expect(calls).toEqual(["reset(device)", "opt_out_capturing"]);
	});

	test("drops a visitor with no stored state", () => {
		const { calls, posthog } = fakePosthog(undefined);
		declineAnalytics(posthog);
		expect(calls).toEqual(["reset(device)", "opt_out_capturing"]);
	});

	test("keeps a signed-in user's identity and only opts out", () => {
		const { calls, posthog } = fakePosthog("identified");
		declineAnalytics(posthog);
		expect(calls).toEqual(["opt_out_capturing"]);
	});
});

describe("declineTracking", () => {
	const globals = globalThis as { window?: unknown };

	afterEach(() => {
		delete globals.window;
	});

	test("reloads when a tracker loaded, even if consent already reads as denied", () => {
		const browser = Object.assign(new EventTarget(), {
			document: { cookie: "paradev-consent-region=opt-out" },
			localStorage: { getItem: () => null, setItem: () => {} },
		});
		globals.window = browser;
		markTrackerLoaded();
		browser.document.cookie = "paradev-consent-region=opt-in";
		expect(canTrack()).toBe(false);

		let reloads = 0;
		declineTracking(() => {
			reloads += 1;
		});
		expect(reloads).toBe(1);
	});
});
