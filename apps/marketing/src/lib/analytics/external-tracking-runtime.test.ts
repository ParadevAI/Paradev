import { expect, mock, test } from "bun:test";
import {
	EXTERNAL_TRACKING_ENDPOINT,
	EXTERNAL_TRACKING_ID,
} from "./external-tracking-client";

test("a reloaded runtime module keeps the document's tracker and original fetch", async () => {
	const globals = globalThis as { window?: unknown; document?: unknown };
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	const originalDocument = Object.getOwnPropertyDescriptor(
		globalThis,
		"document",
	);
	const transport = mock(
		async (_input: RequestInfo | URL, _init?: RequestInit) =>
			new Response("{}"),
	);
	const browser = Object.assign(new EventTarget(), {
		fetch: Object.assign(transport, { preconnect: () => {} }),
		localStorage: { getItem: () => null },
		location: { href: "https://paradev.com/privacy", pathname: "/privacy" },
	});
	globals.window = browser;
	globals.document = Object.assign(new EventTarget(), {
		title: "Privacy",
		referrer: "",
		hidden: false,
	});
	try {
		const path = "./external-tracking-runtime.ts";
		const first = await import(`${path}?before-refresh`);
		first.installExternalTrackingConsentGuard();
		const guard = browser.fetch;
		await guard(EXTERNAL_TRACKING_ENDPOINT, {
			method: "POST",
			body: JSON.stringify({
				type: "external_script_page_view",
				trackingId: EXTERNAL_TRACKING_ID,
				sessionId: "session-1",
			}),
		});
		await Promise.resolve();
		const refreshed = await import(`${path}?after-refresh`);
		refreshed.installExternalTrackingConsentGuard();
		browser.location.href = "https://paradev.com/pricing";
		browser.location.pathname = "/pricing";
		refreshed.trackExternalPageView();
		await Promise.resolve();
		expect(browser.fetch).toBe(guard);
		const events = transport.mock.calls.map(([, init]) =>
			JSON.parse(String(init?.body)),
		);
		expect(events.map((event) => [event.type, event.path])).toEqual([
			["external_script_page_view", "/privacy"],
			["external_page_time_spent", "/privacy"],
			["external_script_page_view", "/pricing"],
		]);
	} finally {
		if (originalWindow)
			Object.defineProperty(globalThis, "window", originalWindow);
		else delete globals.window;
		if (originalDocument)
			Object.defineProperty(globalThis, "document", originalDocument);
		else delete globals.document;
	}
});
