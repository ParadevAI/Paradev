import { afterEach, expect, mock, test } from "bun:test";

import { createConsentAwareTrackingFetch } from "./external-tracking";

const globals = globalThis as { window?: unknown };
const endpoint = "https://backend.leadconnectorhq.com/external-tracking/events";

afterEach(() => {
	delete globals.window;
});

function fixture(choice: string | null = null) {
	const storage = { choice };
	globals.window = {
		location: { href: "https://paradev.com/roadmap" },
		localStorage: { getItem: () => storage.choice },
	};
	const transport = mock(async () => new Response("{}"));
	return {
		storage,
		transport,
		fetch: createConsentAwareTrackingFetch(transport),
	};
}

test("default and accepted visits send the original request unchanged", async () => {
	for (const choice of [null, "accepted"]) {
		const { fetch, transport } = fixture(choice);
		const init = { method: "POST", body: "pageview", keepalive: true };
		await fetch(endpoint, init);
		expect(transport).toHaveBeenCalledWith(endpoint, init);
	}
});

test("checks the current choice for queued, form and unload requests", async () => {
	const { fetch, transport, storage } = fixture();
	await fetch(endpoint);
	storage.choice = "declined";
	for (const input of [endpoint, new URL(endpoint), new Request(endpoint)]) {
		const response = await fetch(input, { method: "POST", keepalive: true });
		expect(response.status).toBe(204);
		expect(response.ok).toBe(true);
	}
	expect(transport).toHaveBeenCalledTimes(1);
});

test("does not block app requests or other vendor endpoints after decline", async () => {
	const { fetch, transport } = fixture("declined");
	for (const url of [
		"/api/subscribe",
		"https://backend.leadconnectorhq.com/other",
		"https://other.example/external-tracking/events",
	]) {
		await fetch(url);
	}
	expect(transport).toHaveBeenCalledTimes(3);
});

test("blocks tracking when the saved preference is unavailable", async () => {
	const { fetch, transport } = fixture();
	globals.window = {
		location: { href: "https://paradev.com/" },
		localStorage: {
			getItem: () => {
				throw new Error("storage unavailable");
			},
		},
	};
	const warn = console.warn;
	console.warn = () => {};
	try {
		expect((await fetch(endpoint)).status).toBe(204);
		expect(transport).not.toHaveBeenCalled();
	} finally {
		console.warn = warn;
	}
});
