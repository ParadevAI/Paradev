import { expect, test } from "bun:test";
import { urlMatchesPattern, WebRequestHub } from "./web-request-hub";

type Listener = (details: object, callback: (response: object) => void) => void;

function fakeSession() {
	const listeners: Record<string, Listener | null> = {};
	const register =
		(event: string) => (_filter: unknown, listener?: Listener) => {
			listeners[event] = listener ?? null;
		};
	const webRequest = {
		onBeforeRequest: register("beforeRequest"),
		onBeforeSendHeaders: register("beforeSendHeaders"),
		onHeadersReceived: register("headersReceived"),
	};
	const fire = (event: string, details: object) => {
		let response: object | undefined;
		listeners[event]?.(details, (value) => {
			response = value;
		});
		return response;
	};
	return { session: { webRequest } as never, listeners, fire };
}

test("two hooks on one session both run instead of replacing each other", () => {
	const { session, fire, listeners } = fakeSession();
	const hub = new WebRequestHub(session);
	hub.add({
		urls: ["https://accounts.google.com/*"],
		onBeforeSendHeaders: (_details, headers) => ({
			...headers,
			"User-Agent": "Firefox",
		}),
	});
	const remove = hub.add({
		urls: ["*://*/*"],
		onBeforeRequest: (details) =>
			(details as { url: string }).url.includes("ads")
				? { cancel: true }
				: undefined,
		onBeforeSendHeaders: (_details, headers) => ({ ...headers, "X-Dnr": "1" }),
	});

	expect(
		fire("beforeSendHeaders", {
			url: "https://accounts.google.com/signin",
			requestHeaders: { Accept: "*/*" },
		}),
	).toEqual({
		requestHeaders: { Accept: "*/*", "User-Agent": "Firefox", "X-Dnr": "1" },
	});
	expect(fire("beforeRequest", { url: "https://x.example/ads.js" })).toEqual({
		cancel: true,
	});
	expect(fire("beforeRequest", { url: "https://x.example/app.js" })).toEqual(
		{},
	);

	remove();
	expect(listeners.beforeRequest).toBeNull();
	expect(
		fire("beforeSendHeaders", {
			url: "https://x.example/",
			requestHeaders: {},
		}),
	).toEqual({});
});

test("match patterns", () => {
	expect(
		urlMatchesPattern(
			"https://*.google.com/*",
			"https://accounts.google.com/x",
		),
	).toBe(true);
	expect(
		urlMatchesPattern("https://*.google.com/*", "https://google.com/"),
	).toBe(true);
	expect(
		urlMatchesPattern("https://*.google.com/*", "https://evilgoogle.com/"),
	).toBe(false);
	expect(urlMatchesPattern("*://*/*", "wss://socket.example/")).toBe(true);
	expect(urlMatchesPattern("*://*/*", "chrome-extension://abc/")).toBe(false);
	expect(urlMatchesPattern("<all_urls>", "https://a.example/")).toBe(true);
	expect(urlMatchesPattern("storage", "https://a.example/")).toBe(false);
});
