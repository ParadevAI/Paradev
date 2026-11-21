import { describe, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { watchGuestMouseDown } from "./focus-forward";

const mouse = (type: string) => [{}, { type, x: 1, y: 1 }];

describe("watchGuestMouseDown", () => {
	test("calls onPress once per mousedown and ignores other mouse events", () => {
		const wc = new EventEmitter();
		let presses = 0;
		watchGuestMouseDown(wc as never, () => presses++);
		wc.emit("before-mouse-event", ...mouse("mouseMove"));
		wc.emit("before-mouse-event", ...mouse("mouseDown"));
		wc.emit("before-mouse-event", ...mouse("mouseUp"));
		expect(presses).toBe(1);
	});

	test("stops after dispose", () => {
		const wc = new EventEmitter();
		let presses = 0;
		const dispose = watchGuestMouseDown(wc as never, () => presses++);
		dispose();
		wc.emit("before-mouse-event", ...mouse("mouseDown"));
		expect(presses).toBe(0);
		expect(wc.listenerCount("before-mouse-event")).toBe(0);
	});
});
