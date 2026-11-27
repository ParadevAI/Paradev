import { afterEach, expect, test } from "bun:test";

import { ANALYTICS_CONSENT_KEY } from "@/lib/constants";
import { createPosthogStarter } from "./posthog-start";

const globals = globalThis as { window?: unknown };

afterEach(() => {
	delete globals.window;
});

test("a Decline saved while posthog-js loads stops init, and a later Accept starts it", async () => {
	const stored = new Map<string, string>();
	globals.window = {
		document: { cookie: "paradev-consent-region=opt-out" },
		localStorage: { getItem: (key: string) => stored.get(key) ?? null },
	};
	let resolveLoad: (posthog: string) => void = () => {};
	const inits: string[] = [];
	const start = createPosthogStarter(
		() =>
			new Promise<string>((resolve) => {
				resolveLoad = resolve;
			}),
		(posthog) => inits.push(posthog),
	);

	const pending = start();
	stored.set(ANALYTICS_CONSENT_KEY, "declined");
	resolveLoad("posthog");
	await pending;
	expect(inits).toEqual([]);

	stored.set(ANALYTICS_CONSENT_KEY, "accepted");
	const restarted = start();
	resolveLoad("posthog");
	await restarted;
	expect(inits).toEqual(["posthog"]);
});
