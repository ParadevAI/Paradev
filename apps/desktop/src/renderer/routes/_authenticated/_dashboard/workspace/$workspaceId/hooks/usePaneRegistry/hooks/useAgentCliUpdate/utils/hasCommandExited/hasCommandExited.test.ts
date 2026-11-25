import { describe, expect, it } from "bun:test";
import { hasCommandExited } from "./hasCommandExited";

const base = { running: false, openedAt: 1_000, startGraceMs: 20_000 };

describe("hasCommandExited", () => {
	it("waits out shell start-up before reading an idle terminal as finished", () => {
		expect(hasCommandExited({ ...base, now: 5_000 })).toBe(false);
		expect(hasCommandExited({ ...base, running: true, now: 30_000 })).toBe(
			false,
		);
		expect(hasCommandExited({ ...base, now: 21_000 })).toBe(true);
		expect(
			hasCommandExited({ ...base, openedAt: undefined, now: 60_000 }),
		).toBe(false);
	});
});
