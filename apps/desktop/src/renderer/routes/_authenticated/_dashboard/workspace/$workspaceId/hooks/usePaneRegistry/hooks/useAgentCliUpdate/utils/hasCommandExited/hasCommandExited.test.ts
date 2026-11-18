import { describe, expect, it } from "bun:test";
import { hasCommandExited } from "./hasCommandExited";

const base = {
	running: false,
	ran: false,
	openedAt: 1_000,
	startGraceMs: 15_000,
};

describe("hasCommandExited", () => {
	it("tells a command not started yet from one that ended between polls", () => {
		expect(hasCommandExited({ ...base, running: true, now: 2_000 })).toBe(
			false,
		);
		expect(hasCommandExited({ ...base, ran: true, now: 2_000 })).toBe(true);
		expect(hasCommandExited({ ...base, now: 5_000 })).toBe(false);
		expect(hasCommandExited({ ...base, now: 16_000 })).toBe(true);
		expect(
			hasCommandExited({ ...base, openedAt: undefined, now: 60_000 }),
		).toBe(false);
	});
});
