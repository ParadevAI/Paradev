import { afterEach, describe, expect, test } from "bun:test";
import { acceptTracking, declineAnalytics, declineTracking } from "./choice";
import {
	canTrack,
	markCookielessAnalytics,
	markTrackerLoaded,
} from "./consent";

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
			set_config: (config: { disable_persistence?: boolean }) => {
				if (config.disable_persistence) calls.push("disable_persistence");
			},
		},
	};
}

describe("declineAnalytics", () => {
	test("drops the anonymous visitor before opting out", () => {
		const { calls, posthog } = fakePosthog("anonymous");
		declineAnalytics(posthog);
		expect(calls).toEqual([
			"reset(device)",
			"opt_out_capturing",
			"disable_persistence",
		]);
	});

	test("drops a visitor with no stored state", () => {
		const { calls, posthog } = fakePosthog(undefined);
		declineAnalytics(posthog);
		expect(calls).toEqual([
			"reset(device)",
			"opt_out_capturing",
			"disable_persistence",
		]);
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

describe("acceptTracking", () => {
	const globals = globalThis as { window?: unknown };

	afterEach(() => {
		delete globals.window;
	});

	function fakeBrowser() {
		const stored = new Map<string, string>();
		globals.window = Object.assign(new EventTarget(), {
			document: { cookie: "paradev-consent-region=opt-in" },
			localStorage: {
				getItem: (key: string) => stored.get(key) ?? null,
				setItem: (key: string, value: string) => stored.set(key, value),
			},
		});
	}

	test("reloads when cookieless analytics runs", () => {
		fakeBrowser();
		markCookielessAnalytics();
		let reloads = 0;
		acceptTracking(() => {
			reloads += 1;
		});
		expect(canTrack()).toBe(true);
		expect(reloads).toBe(1);
	});

	test("does not reload before analytics has started", () => {
		fakeBrowser();
		let reloads = 0;
		acceptTracking(() => {
			reloads += 1;
		});
		expect(canTrack()).toBe(true);
		expect(reloads).toBe(0);
	});
});
