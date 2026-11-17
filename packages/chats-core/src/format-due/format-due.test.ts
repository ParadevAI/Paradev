import { describe, expect, test } from "bun:test";
import { formatDue } from "./format-due.ts";

const now = new Date(2026, 9, 8, 15, 30); // Thursday

describe("formatDue", () => {
	test("relative days", () => {
		expect(formatDue("2026-10-08", now)).toEqual({
			label: "Today",
			overdue: false,
		});
		expect(formatDue("2026-10-09", now)).toEqual({
			label: "Tomorrow",
			overdue: false,
		});
		expect(formatDue("2026-10-07", now)).toEqual({
			label: "Yesterday",
			overdue: true,
		});
	});

	test("weekday name within the week, a date beyond it", () => {
		expect(formatDue("2026-10-12", now).label).toBe(
			new Date(2026, 9, 12).toLocaleDateString(undefined, { weekday: "long" }),
		);
		expect(formatDue("2026-10-20", now).label).toBe(
			new Date(2026, 9, 20).toLocaleDateString(undefined, {
				day: "numeric",
				month: "short",
			}),
		);
	});

	test("older dates are overdue", () => {
		expect(formatDue("2026-09-30", now).overdue).toBe(true);
	});
});
