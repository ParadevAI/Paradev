import { afterEach, expect, test } from "bun:test";

import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";
import { scheduleAdTrackers } from "./ad-trackers";
import { hasLoadedTracker } from "./consent";

const globals = globalThis as { window?: unknown; document?: unknown };

afterEach(() => {
	delete globals.window;
	delete globals.document;
});

test("a Decline before the queued load runs keeps Google Ads and Reddit out", () => {
	const stored = new Map<string, string>();
	const appended: string[] = [];
	const idle: (() => void)[] = [];
	globals.document = {
		readyState: "complete",
		cookie: "paradev-consent-region=opt-out",
		createElement: () => ({}),
		head: {
			appendChild: (script: { src: string }) => appended.push(script.src),
		},
	};
	globals.window = Object.assign(new EventTarget(), {
		document: globals.document,
		localStorage: { getItem: (key: string) => stored.get(key) ?? null },
		requestIdleCallback: (callback: () => void) => idle.push(callback),
		cancelIdleCallback: () => {},
	});

	scheduleAdTrackers();
	stored.set(ANALYTICS_CONSENT_KEY, "declined");
	for (const callback of idle) callback();

	expect(appended).toEqual([]);
	expect(hasLoadedTracker()).toBe(false);
	expect((globals.window as { gtag?: unknown }).gtag).toBeUndefined();
});
