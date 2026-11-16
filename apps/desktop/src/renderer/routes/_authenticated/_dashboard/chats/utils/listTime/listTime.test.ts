import { describe, expect, test } from "bun:test";
import { listTime } from "./listTime";

const now = new Date(2026, 10, 16, 15, 0);

describe("listTime", () => {
	test("today is a clock time, this week a weekday, older a date", () => {
		expect(listTime(new Date(2026, 10, 16, 9, 41), now)).toMatch(/9:41/);
		expect(listTime(new Date(2026, 10, 13, 9, 0), now)).toBe("Fri");
		expect(listTime(new Date(2026, 10, 1, 9, 0), now)).toBe("Nov 1");
		expect(listTime(new Date(2025, 10, 1, 9, 0), now)).toMatch(/2025/);
	});
});
