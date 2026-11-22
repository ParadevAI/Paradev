import { expect, test } from "bun:test";
import { pauseUntil } from "./pauseUntil";

test("pauses for a span, or until 9:00 tomorrow", () => {
	const now = new Date(2026, 9, 26, 22, 15);
	expect(pauseUntil("30m", now)).toEqual(new Date(2026, 9, 26, 22, 45));
	expect(pauseUntil("2h", now)).toEqual(new Date(2026, 9, 27, 0, 15));
	expect(pauseUntil("tomorrow", now)).toEqual(new Date(2026, 9, 27, 9, 0));
});
