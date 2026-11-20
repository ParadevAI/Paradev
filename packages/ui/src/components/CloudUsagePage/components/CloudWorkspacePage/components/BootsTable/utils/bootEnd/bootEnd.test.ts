import { describe, expect, it } from "bun:test";
import { bootEnd } from "./bootEnd";

const stoppedAt = new Date("2026-11-10T11:00:00Z");

describe("bootEnd", () => {
	it("is running while open, and absent when the reason was not recorded", () => {
		expect(bootEnd({ stoppedAt: null, endReason: null })).toBe("running");
		expect(bootEnd({ stoppedAt, endReason: null })).toBeNull();
		expect(bootEnd({ stoppedAt, endReason: "unknown" })).toBeNull();
		expect(bootEnd({ stoppedAt, endReason: "idle" })).toBe("idle");
	});

	it("shows a recorded reason even before the stop is written", () => {
		expect(bootEnd({ stoppedAt: null, endReason: "idle" })).toBe("idle");
	});
});
