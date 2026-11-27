import { afterEach, expect, test } from "bun:test";

import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";
import { hasCookielessAnalytics, hasLoadedTracker } from "./consent";
import { createPosthogStarter, type PosthogMode } from "./posthog-start";

const globals = globalThis as { window?: unknown };

afterEach(() => {
	delete globals.window;
});

function fakeWindow(region: "opt-in" | "opt-out") {
	const stored = new Map<string, string>();
	globals.window = {
		document: { cookie: `paradev-consent-region=${region}` },
		localStorage: { getItem: (key: string) => stored.get(key) ?? null },
	};
	return stored;
}

function starter() {
	const inits: PosthogMode[] = [];
	let resolveLoad: () => void = () => {};
	const start = createPosthogStarter(
		() =>
			new Promise<void>((resolve) => {
				resolveLoad = resolve;
			}),
		(_posthog, mode) => inits.push(mode),
	);
	return { inits, start, load: () => resolveLoad() };
}

test("a Decline saved while posthog-js loads starts it without cookies", async () => {
	const stored = fakeWindow("opt-out");
	const { inits, start, load } = starter();

	const pending = start();
	stored.set(ANALYTICS_CONSENT_KEY, "declined");
	load();
	await pending;

	expect(inits).toEqual(["cookieless"]);
	expect(hasCookielessAnalytics()).toBe(true);
	expect(hasLoadedTracker()).toBe(false);
});

test("an undecided opt-in visitor gets cookieless analytics once", async () => {
	fakeWindow("opt-in");
	const { inits, start, load } = starter();

	const pending = start();
	load();
	await pending;
	await start();

	expect(inits).toEqual(["cookieless"]);
});

test("consent starts full analytics", async () => {
	fakeWindow("opt-out");
	const { inits, start, load } = starter();

	const pending = start();
	load();
	await pending;

	expect(inits).toEqual(["full"]);
	expect(hasLoadedTracker()).toBe(true);
});
