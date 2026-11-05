import { describe, expect, test } from "bun:test";
import {
	TOOLS_FRAME_CHANNEL,
	TOOLS_HOST_CHANNEL,
} from "@superset/shared/page-tools";
import { unavailableToolsListener } from "./unavailableToolsListener";

const ORIGIN = "https://page.example";

function frame() {
	const posted: { message: unknown; origin: string }[] = [];
	const win = {
		postMessage: (message: unknown, origin: string) =>
			posted.push({ message, origin }),
	} as unknown as Window;
	return { win, posted };
}

function event(source: Window, type: string, origin = ORIGIN): MessageEvent {
	return {
		origin,
		source,
		data: { channel: TOOLS_FRAME_CHANNEL, type },
	} as MessageEvent;
}

describe("unavailableToolsListener", () => {
	test("answers a signed-out reader's hello with signed_out", () => {
		const { win, posted } = frame();
		unavailableToolsListener(ORIGIN, () => win, false)(event(win, "hello"));
		expect(posted).toEqual([
			{
				message: {
					channel: TOOLS_HOST_CHANNEL,
					type: "ready",
					available: false,
					reason: "signed_out",
				},
				origin: ORIGIN,
			},
		]);
	});

	test("answers a signed-in reader's hello with unavailable", () => {
		const { win, posted } = frame();
		unavailableToolsListener(ORIGIN, () => win, true)(event(win, "hello"));
		expect(posted).toEqual([
			{
				message: {
					channel: TOOLS_HOST_CHANNEL,
					type: "ready",
					available: false,
					reason: "unavailable",
				},
				origin: ORIGIN,
			},
		]);
	});

	test("ignores calls and messages from anything but the frame", () => {
		const { win, posted } = frame();
		const listen = unavailableToolsListener(ORIGIN, () => win, false);
		listen(event(win, "call"));
		listen(event(win, "hello", "https://evil"));
		listen(event({} as Window, "hello"));
		expect(posted).toEqual([]);
	});
});
