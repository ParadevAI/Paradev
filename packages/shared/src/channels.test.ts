import { describe, expect, test } from "bun:test";
import {
	CHANNEL_NAME_PATTERN,
	normalizeChannelName,
	parseChannelRealtimeEvent,
	previewOf,
} from "./channels";

describe("normalizeChannelName", () => {
	test("turns a typed name into a channel name", () => {
		expect(normalizeChannelName("  Design Review! ")).toBe("design-review");
		expect(normalizeChannelName("--ops_team")).toBe("ops_team");
	});

	test("leaves nothing valid when there are no usable characters", () => {
		expect(CHANNEL_NAME_PATTERN.test(normalizeChannelName("!!!"))).toBe(false);
	});
});

describe("parseChannelRealtimeEvent", () => {
	test("accepts known events from a socket frame", () => {
		const event = parseChannelRealtimeEvent(
			JSON.stringify({ type: "channel.read", channelId: "c", lastReadSeq: 3 }),
		);
		expect(event?.type).toBe("channel.read");
	});

	test("rejects unknown or malformed frames", () => {
		expect(parseChannelRealtimeEvent("{")).toBeNull();
		expect(parseChannelRealtimeEvent({ type: "workspace.changed" })).toBeNull();
	});
});

test("previewOf flattens whitespace and truncates", () => {
	expect(previewOf("a\n\n b")).toBe("a b");
	expect(previewOf("x".repeat(500))).toHaveLength(140);
});
