import { afterEach, expect, mock, test } from "bun:test";
import type { PostHog } from "posthog-js";

import { createPosthogQueue } from "./lazy";

const globals = globalThis as { window?: unknown };

afterEach(() => {
	delete globals.window;
});

function declinedWindow() {
	globals.window = {
		document: { cookie: "paradev-consent-region=opt-in.DE" },
		localStorage: { getItem: () => "declined" },
	};
}

test("a click queued before PostHog loads reaches the cookieless instance", () => {
	declinedWindow();
	const queue = createPosthogQueue();
	const capture = mock();

	queue.capture("download_clicked", { platform: "mac", source: "hero" });
	queue.setAnonymousPosthog({ capture });

	expect(capture).toHaveBeenCalledWith("download_clicked", {
		platform: "mac",
		source: "hero",
	});
});

test("no email reaches the cookieless instance from a waitlist signup", () => {
	declinedWindow();
	const queue = createPosthogQueue();
	const capture = mock();
	queue.setAnonymousPosthog({ capture });

	queue.capture("waitlist_signup", {
		email: "a@example.com",
		note: "a@example.com",
		$set: { email: "a@example.com" },
		nested: { email: "a@example.com" },
		platform: "windows_linux",
	});

	expect(capture).toHaveBeenCalledWith("waitlist_signup", {
		platform: "windows_linux",
	});
});

test("calls other than capture never reach the cookieless instance", () => {
	globals.window = {
		document: { cookie: "paradev-consent-region=opt-out.US" },
		localStorage: { getItem: () => null },
	};
	const queue = createPosthogQueue();
	const callback = mock();

	queue.withPosthog(callback);
	queue.setAnonymousPosthog({ capture: mock() });
	queue.withPosthog(callback);

	expect(callback).not.toHaveBeenCalled();
});

test("with consent the full instance gets the properties as sent", () => {
	const queue = createPosthogQueue();
	const capture = mock();
	queue.setPosthogInstance({ capture } as unknown as PostHog);

	queue.capture("waitlist_signup", { email: "a@example.com" });

	expect(capture).toHaveBeenCalledWith("waitlist_signup", {
		email: "a@example.com",
	});
});
