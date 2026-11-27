import { describe, expect, test } from "bun:test";
import {
	createDeepLinkDelivery,
	DEEP_LINK_NAVIGATE_CHANNEL,
} from "./deep-link-delivery";

function fakeWindow(id = 1) {
	const sent: Array<[string, string]> = [];
	return {
		sent,
		target: {
			id,
			send: (channel: string, route: string) => {
				sent.push([channel, route]);
			},
		},
	};
}

describe("createDeepLinkDelivery", () => {
	test("holds a route for a window that is still loading", () => {
		const delivery = createDeepLinkDelivery();
		const { target, sent } = fakeWindow();

		delivery.deliver(target, "/tasks/a");
		expect(sent).toEqual([]);

		delivery.markListening(target);
		expect(sent).toEqual([[DEEP_LINK_NAVIGATE_CHANNEL, "/tasks/a"]]);

		delivery.markListening(target);
		expect(sent).toHaveLength(1);
	});

	test("sends at once to a window that is listening", () => {
		const delivery = createDeepLinkDelivery();
		const { target, sent } = fakeWindow();

		delivery.markListening(target);
		delivery.deliver(target, "/tasks/a");
		expect(sent).toEqual([[DEEP_LINK_NAVIGATE_CHANNEL, "/tasks/a"]]);
	});

	test("keeps only the newest held route", () => {
		const delivery = createDeepLinkDelivery();
		const { target, sent } = fakeWindow();

		delivery.deliver(target, "/tasks/a");
		delivery.deliver(target, "/tasks/b");
		delivery.markListening(target);
		expect(sent).toEqual([[DEEP_LINK_NAVIGATE_CHANNEL, "/tasks/b"]]);
	});

	test("holds again while the window reloads", () => {
		const delivery = createDeepLinkDelivery();
		const { target, sent } = fakeWindow();

		delivery.markListening(target);
		delivery.markLoading(target.id);
		delivery.deliver(target, "/tasks/a");
		expect(sent).toEqual([]);

		delivery.markListening(target);
		expect(sent).toEqual([[DEEP_LINK_NAVIGATE_CHANNEL, "/tasks/a"]]);
	});

	test("does not send a held route to another window", () => {
		const delivery = createDeepLinkDelivery();
		const first = fakeWindow(1);
		const second = fakeWindow(2);

		delivery.deliver(first.target, "/tasks/a");
		delivery.markListening(second.target);
		expect(second.sent).toEqual([]);
	});
});
