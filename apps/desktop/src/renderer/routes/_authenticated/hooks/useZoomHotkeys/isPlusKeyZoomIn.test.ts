import { describe, expect, it } from "bun:test";
import { isPlusKeyZoomIn } from "./isPlusKeyZoomIn";

const key = (
	init: Partial<{
		key: string;
		code: string;
		ctrlKey: boolean;
		metaKey: boolean;
		altKey: boolean;
		altGraph: boolean;
	}>,
) => ({
	key: init.key ?? "",
	code: init.code ?? "",
	ctrlKey: init.ctrlKey ?? false,
	metaKey: init.metaKey ?? false,
	altKey: init.altKey ?? false,
	isComposing: false,
	getModifierState: (k: string) => k === "AltGraph" && !!init.altGraph,
});

describe("isPlusKeyZoomIn", () => {
	it("matches Ctrl with the German QWERTZ + key", () => {
		expect(
			isPlusKeyZoomIn(
				key({ key: "+", code: "BracketRight", ctrlKey: true }),
				false,
			),
		).toBe(true);
	});

	it("matches Ctrl with numpad +", () => {
		expect(
			isPlusKeyZoomIn(
				key({ key: "+", code: "NumpadAdd", ctrlKey: true }),
				false,
			),
		).toBe(true);
	});

	it("matches Cmd, not Ctrl, on macOS", () => {
		const plus = { key: "+", code: "BracketRight" };
		expect(isPlusKeyZoomIn(key({ ...plus, metaKey: true }), true)).toBe(true);
		expect(isPlusKeyZoomIn(key({ ...plus, ctrlKey: true }), true)).toBe(false);
	});

	it("leaves the = key to the ZOOM_IN binding", () => {
		expect(
			isPlusKeyZoomIn(key({ key: "=", code: "Equal", ctrlKey: true }), false),
		).toBe(false);
	});

	it("ignores + without the modifier, with Alt, or typed with AltGr", () => {
		const plus = { key: "+", code: "BracketRight" };
		expect(isPlusKeyZoomIn(key(plus), false)).toBe(false);
		expect(
			isPlusKeyZoomIn(key({ ...plus, ctrlKey: true, altKey: true }), false),
		).toBe(false);
		expect(
			isPlusKeyZoomIn(key({ ...plus, ctrlKey: true, altGraph: true }), false),
		).toBe(false);
	});
});
