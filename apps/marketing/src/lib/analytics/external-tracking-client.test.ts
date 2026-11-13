import { expect, mock, test } from "bun:test";
import {
	createExternalTrackingClient,
	EXTERNAL_TRACKING_ID,
} from "./external-tracking-client";

function fixture() {
	const state = { time: 0, declined: false, visible: true, path: "/privacy" };
	const transport = mock(async (_event: Record<string, unknown>) => {});
	const client = createExternalTrackingClient({
		transport,
		hasDeclined: () => state.declined,
		now: () => state.time,
		isVisible: () => state.visible,
		readPage: () => ({
			url: `https://paradev.com${state.path}`,
			path: state.path,
			title: state.path,
			referrer: "",
			userAgent: "test",
		}),
	});
	return { client, transport, state };
}

test("initializes once and preserves the vendor tracking and session IDs", async () => {
	const { client, transport } = fixture();
	client.initialize({
		sessionId: "session-1",
		contactId: "contact-1",
		userId: "user-1",
	});
	client.initialize({ sessionId: "session-2" });
	client.navigate();
	await Promise.resolve();
	expect(transport).toHaveBeenCalledTimes(1);
	expect(transport.mock.calls[0]?.[0]).toMatchObject({
		type: "external_script_page_view",
		trackingId: EXTERNAL_TRACKING_ID,
		sessionId: "session-1",
		contactId: "contact-1",
		userId: "user-1",
	});
});

test("reports each route and attributes elapsed time to the page being left", async () => {
	const { client, transport, state } = fixture();
	client.initialize({ sessionId: "session-1" });
	state.time = 500;
	state.path = "/pricing?plan=pro";
	client.navigate();
	state.time = 800;
	state.path = "/privacy";
	client.navigate();
	await Promise.resolve();
	const events = transport.mock.calls.map(([event]) => event);
	expect(events.map((event) => [event.type, event.path])).toEqual([
		["external_script_page_view", "/privacy"],
		["external_page_time_spent", "/privacy"],
		["external_script_page_view", "/pricing?plan=pro"],
		["external_page_time_spent", "/pricing?plan=pro"],
		["external_script_page_view", "/privacy"],
	]);
	expect(events[1]?.properties).toMatchObject({ timeSpentMs: 500 });
	expect(events[3]?.properties).toMatchObject({ timeSpentMs: 300 });
});

test("excludes hidden and idle time, and flushes unload only once", async () => {
	const { client, transport, state } = fixture();
	client.initialize({ sessionId: "session-1" });
	state.time = 100;
	state.visible = false;
	client.visibilityChanged();
	state.time = 1000;
	state.visible = true;
	client.visibilityChanged();
	state.time = 1000 + 60 * 60 * 1000;
	client.flush();
	client.flush();
	await Promise.resolve();
	expect(transport).toHaveBeenCalledTimes(2);
	expect(transport.mock.calls[1]?.[0].properties).toMatchObject({
		timeSpentMs: 100 + 30 * 60 * 1000,
	});
});

test("queues successful submissions before initialization and sends only explicit email data", async () => {
	const { client, transport } = fixture();
	client.submit("contact", "synthetic@example.invalid");
	expect(transport).not.toHaveBeenCalled();
	client.initialize({ sessionId: "session-1" });
	await Promise.resolve();
	expect(transport.mock.calls[1]?.[0]).toMatchObject({
		type: "external_form_submission",
		formId: "contact",
		formData: { email: "synthetic@example.invalid" },
	});
	expect(transport.mock.calls[1]?.[0].formData).toEqual({
		email: "synthetic@example.invalid",
	});
	expect(transport.mock.calls[1]?.[0]).not.toHaveProperty("files");
});

test("decline blocks pending sends, successful forms, navigation and unload", async () => {
	const { client, transport, state } = fixture();
	client.initialize({ sessionId: "session-1" });
	state.declined = true;
	client.submit("contact", "synthetic@example.invalid");
	state.path = "/pricing";
	client.navigate();
	client.flush();
	await Promise.resolve();
	expect(transport).not.toHaveBeenCalled();
});
