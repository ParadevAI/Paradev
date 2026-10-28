import { describe, expect, test } from "bun:test";
import {
	channelNotificationContent,
	channelNotificationPath,
	parseReplyTarget,
	replyTargetOf,
} from "./channelNotification";

const event = (
	overrides: Partial<Parameters<typeof channelNotificationContent>[0]> = {},
): Parameters<typeof channelNotificationContent>[0] => ({
	type: "channel.notify",
	organizationId: "o",
	organizationName: "Superset",
	channelId: "c",
	channelName: "eng",
	messageId: "m",
	threadRootId: null,
	reason: "mention",
	authorName: "Kiet Ho",
	preview: "shipped it",
	showPreview: true,
	...overrides,
});

describe("channelNotificationContent", () => {
	test("organization over the channel, then the sender and text", () => {
		expect(channelNotificationContent(event())).toEqual({
			title: "Superset",
			subtitle: "#eng",
			body: "Kiet Ho: shipped it",
		});
		expect(
			channelNotificationContent(event({ threadRootId: "r" })).subtitle,
		).toBe("Thread in #eng");
	});

	test("the channel is the title when the organization is unknown", () => {
		expect(channelNotificationContent(event({ organizationName: "" }))).toEqual(
			{ title: "#eng", body: "Kiet Ho: shipped it" },
		);
	});

	test("without a preview names only the sender", () => {
		expect(
			channelNotificationContent(event({ showPreview: false, preview: "" }))
				.body,
		).toBe("a message from Kiet Ho");
	});
});

describe("channelNotificationPath", () => {
	test("opens the thread, or jumps to the message", () => {
		expect(channelNotificationPath(event({ threadRootId: "r" }))).toBe(
			"/channels/c?thread=r",
		);
		expect(channelNotificationPath(event())).toBe("/channels/c?message=m");
	});
});

describe("reply target", () => {
	test("a banner reply goes to its thread, else the channel", () => {
		expect(
			parseReplyTarget(replyTargetOf(event({ threadRootId: "r" }))),
		).toEqual({ channelId: "c", threadRootId: "r" });
		expect(parseReplyTarget(replyTargetOf(event()))).toEqual({
			channelId: "c",
			threadRootId: null,
		});
		expect(parseReplyTarget("not json")).toBeNull();
	});
});
