import { expect, test } from "bun:test";
import { jumpTarget } from "./jumpTarget";

const now = new Date(2026, 2, 3, 15, 30);

test("jump targets start at midnight and cross month edges", () => {
	expect(jumpTarget("today", now)).toEqual(new Date(2026, 2, 3));
	expect(jumpTarget("yesterday", now)).toEqual(new Date(2026, 2, 2));
	expect(jumpTarget("last-week", now)).toEqual(new Date(2026, 1, 24));
	expect(jumpTarget("last-month", now)).toEqual(new Date(2026, 1, 3));
	expect(jumpTarget("beginning", now)).toBeNull();
});
