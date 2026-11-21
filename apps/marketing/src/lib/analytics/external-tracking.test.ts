import { afterEach, expect, mock, test } from "bun:test";

import { createConsentAwareTrackingFetch } from "./external-tracking";
import { EXTERNAL_TRACKING_ID } from "./external-tracking-client";

const globals = globalThis as { window?: unknown };
const endpoint = "https://backend.leadconnectorhq.com/external-tracking/events";
const page = JSON.stringify({
	type: "external_script_page_view",
	trackingId: EXTERNAL_TRACKING_ID,
	sessionId: "session-1",
	contactId: "contact-1",
	userId: "user-1",
	properties: { deviceType: "mobile", unexpected: "private data" },
});

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
	const initialize = mock(() => {});
	return {
		storage,
		transport,
		initialize,
		fetch: createConsentAwareTrackingFetch(transport, undefined, initialize),
	};
}

test("initializes the app adapter from a vendor page event without forwarding it", async () => {
	for (const choice of [null, "accepted"]) {
		const { fetch, transport, initialize } = fixture(choice);
		expect((await fetch(endpoint, { method: "POST", body: page })).status).toBe(
			204,
		);
		expect(initialize).toHaveBeenCalledWith({
			sessionId: "session-1",
			contactId: "contact-1",
			userId: "user-1",
			deviceType: "mobile",
		});
		expect(transport).not.toHaveBeenCalled();
	}
});

test("drops automatic forms, files, timing events and unknown payloads", async () => {
	const { fetch, transport, initialize } = fixture();
	const multipart = new FormData();
	multipart.append(
		"event",
		JSON.stringify({ type: "external_form_submission" }),
	);
	multipart.append("password", "must-not-leave");
	multipart.append("file", new Blob(["private attachment"]), "private.txt");
	for (const body of [
		JSON.stringify({
			type: "external_form_submission",
			formData: { password: "secret" },
		}),
		JSON.stringify({ type: "external_page_time_spent" }),
		multipart,
		"unknown payload",
	]) {
		const response = await fetch(endpoint, {
			method: "POST",
			body,
			keepalive: true,
		});
		expect(response.status).toBe(204);
	}
	expect(transport).not.toHaveBeenCalled();
	expect(initialize).not.toHaveBeenCalled();
});

test("checks current consent before initializing from Request or URL inputs", async () => {
	const { fetch, transport, storage, initialize } = fixture();
	await fetch(new Request(endpoint, { method: "POST", body: page }));
	expect(initialize).toHaveBeenCalledTimes(1);
	storage.choice = "declined";
	await fetch(new URL(endpoint), { method: "POST", body: page });
	expect(initialize).toHaveBeenCalledTimes(1);
	expect(transport).not.toHaveBeenCalled();
});

test("does not intercept app requests or other vendor endpoints", async () => {
	const { fetch, transport } = fixture("declined");
	for (const url of [
		"/api/subscribe",
		"https://backend.leadconnectorhq.com/other",
		"https://other.example/external-tracking/events",
	]) {
		const init = { method: "POST", body: "original body" };
		await fetch(url, init);
		expect(transport).toHaveBeenLastCalledWith(url, init);
	}
});

test("blocks initialization when stored consent cannot be read", async () => {
	const { fetch, transport, initialize } = fixture();
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
		expect((await fetch(endpoint, { method: "POST", body: page })).status).toBe(
			204,
		);
		expect(transport).not.toHaveBeenCalled();
		expect(initialize).not.toHaveBeenCalled();
	} finally {
		console.warn = warn;
	}
});
