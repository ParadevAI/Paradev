import { describe, expect, test } from "bun:test";
import { TOOLS_FRAME_CHANNEL } from "@superset/shared/page-tools";
import { acceptsFrameMessage } from "./acceptsFrameMessage";

const ORIGIN = "https://page.example";
const frame = {} as Window;

function event(overrides: Partial<MessageEvent> = {}): MessageEvent {
	return {
		origin: ORIGIN,
		source: frame,
		data: { channel: TOOLS_FRAME_CHANNEL, type: "hello" },
		...overrides,
	} as MessageEvent;
}

describe("acceptsFrameMessage", () => {
	test("ignores messages from other origins and windows", () => {
		expect(
			acceptsFrameMessage(event({ origin: "https://evil" }), ORIGIN, frame),
		).toBe(false);
		expect(
			acceptsFrameMessage(event({ source: {} as Window }), ORIGIN, frame),
		).toBe(false);
		expect(acceptsFrameMessage(event(), ORIGIN, null)).toBe(false);
		expect(
			acceptsFrameMessage(
				event({ data: { channel: "superset-storage/frame" } }),
				ORIGIN,
				frame,
			),
		).toBe(false);
		expect(acceptsFrameMessage(event({ data: null }), ORIGIN, frame)).toBe(
			false,
		);
		expect(acceptsFrameMessage(event(), ORIGIN, frame)).toBe(true);
	});
});
