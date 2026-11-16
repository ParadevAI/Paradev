import { describe, expect, test } from "bun:test";
import { formatChatListTime, formatListTime } from "./format-list-time.ts";

const now = new Date(2026, 9, 10, 18, 0);

describe("formatListTime", () => {
	test("a time for today", () => {
		const at = new Date(2026, 9, 10, 9, 5);
		expect(formatListTime(at, now)).toBe(
			at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
		);
	});

	test("a short date for earlier days", () => {
		const at = new Date(2026, 9, 9, 23, 59);
		expect(formatListTime(at, now)).toBe(
			at.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
		);
	});
});

describe("formatChatListTime", () => {
	test("the time today", () => {
		const at = new Date(2026, 9, 10, 0, 1);
		expect(formatChatListTime(at, now)).toBe(
			at.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
		);
	});

	test("Yesterday, then the weekday within the week", () => {
		expect(formatChatListTime(new Date(2026, 9, 9, 23, 59), now)).toBe(
			"Yesterday",
		);
		const tuesday = new Date(2026, 9, 6, 8, 0);
		expect(formatChatListTime(tuesday, now)).toBe(
			tuesday.toLocaleDateString(undefined, { weekday: "long" }),
		);
		const fourth = new Date(2026, 9, 4, 8, 0);
		expect(formatChatListTime(fourth, now)).toBe(
			fourth.toLocaleDateString(undefined, { weekday: "long" }),
		);
	});

	test("a week or more ago, the date; another year's with its year", () => {
		const week = new Date(2026, 9, 3, 12, 0);
		expect(formatChatListTime(week, now)).toBe(
			week.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
		);
		const lastYear = new Date(2025, 11, 30, 12, 0);
		expect(formatChatListTime(lastYear, now)).toBe(
			lastYear.toLocaleDateString(undefined, {
				day: "numeric",
				month: "short",
				year: "numeric",
			}),
		);
	});
});
