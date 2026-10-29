import { describe, expect, test } from "bun:test";
import {
	CHANNEL_NAME_PATTERN,
	normalizeChannelName,
	notificationTextOf,
	parseChannelRealtimeEvent,
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

describe("notificationTextOf", () => {
	test("drops formatting and link targets, keeps line breaks", () => {
		expect(
			notificationTextOf(
				"**Deploy** is done ✅ @Satya Patel\n- staging is green\n- prod at 3pm\nSee [the PR](https://x.dev/1) and run `bun test`",
			),
		).toBe(
			"Deploy is done ✅ @Satya Patel\n• staging is green\n• prod at 3pm\nSee the PR and run bun test",
		);
	});

	test("italics, strike, quotes, headings, code blocks and escapes", () => {
		expect(notificationTextOf("_soon_ and *now* ~~never~~")).toBe(
			"soon and now never",
		);
		expect(notificationTextOf("# Title\n> quoted")).toBe("Title\nquoted");
		expect(notificationTextOf("```ts\nconst a = 1;\n```")).toBe("const a = 1;");
		expect(notificationTextOf("2 \\* 3 and snake_case_name")).toBe(
			"2 * 3 and snake_case_name",
		);
	});

	test("caps long messages", () => {
		expect(notificationTextOf("x".repeat(5_000))).toHaveLength(2_000);
	});
});
