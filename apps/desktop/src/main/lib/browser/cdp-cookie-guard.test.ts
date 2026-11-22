import { describe, expect, it } from "bun:test";
import { cookieRefusal, redactCookies } from "./cdp-cookie-guard";

describe("cookieRefusal", () => {
	it("refuses every command that reads or writes cookies", () => {
		for (const method of [
			"Network.getAllCookies",
			"Network.getCookies",
			"Network.setCookies",
			"Storage.getCookies",
			"Storage.clearCookies",
		]) {
			expect(cookieRefusal(method, {})).not.toBeNull();
		}
		expect(
			cookieRefusal("Storage.clearDataForOrigin", {
				origin: "https://a.test",
				storageTypes: "local_storage,cookies",
			}),
		).not.toBeNull();
		expect(
			cookieRefusal("Network.setExtraHTTPHeaders", {
				headers: { Cookie: "sid=1" },
			}),
		).not.toBeNull();
		expect(
			cookieRefusal("Fetch.fulfillRequest", {
				requestId: "1",
				responseCode: 200,
				responseHeaders: [{ name: "Set-Cookie", value: "sid=1" }],
			}),
		).not.toBeNull();
	});

	it("lets other commands through", () => {
		expect(cookieRefusal("Page.navigate", { url: "https://a.test" })).toBe(
			null,
		);
		expect(
			cookieRefusal("Storage.clearDataForOrigin", {
				origin: "https://a.test",
				storageTypes: "local_storage",
			}),
		).toBe(null);
		expect(
			cookieRefusal("Network.setExtraHTTPHeaders", {
				headers: { "X-Test": "1" },
			}),
		).toBe(null);
	});
});

describe("redactCookies", () => {
	it("strips cookie headers and cookie lists from network events", () => {
		expect(
			redactCookies("Network.requestWillBeSentExtraInfo", {
				requestId: "1",
				associatedCookies: [{ cookie: { name: "sid", value: "secret" } }],
				headers: { cookie: "sid=secret", accept: "*/*" },
			}),
		).toEqual({ requestId: "1", headers: { accept: "*/*" } });
		expect(
			redactCookies("Network.responseReceived", {
				response: {
					headers: { "Set-Cookie": "sid=secret", "Content-Type": "text/html" },
					headersText: "HTTP/1.1 200 OK\r\nSet-Cookie: sid=secret\r\nA: b",
				},
			}),
		).toEqual({
			response: {
				headers: { "Content-Type": "text/html" },
				headersText: "HTTP/1.1 200 OK\r\nA: b",
			},
		});
		expect(
			redactCookies("Fetch.requestPaused", {
				responseHeaders: [
					{ name: "set-cookie", value: "sid=secret" },
					{ name: "a", value: "b" },
				],
			}),
		).toEqual({ responseHeaders: [{ name: "a", value: "b" }] });
	});

	it("leaves other events alone", () => {
		const params = { headers: { cookie: "kept" } };
		expect(redactCookies("Page.frameNavigated", params)).toBe(params);
	});
});
