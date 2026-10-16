import { describe, expect, test } from "bun:test";
import { inboxBadgeCount } from "./inboxBadgeCount";

const counts = {
	unreadAsks: 3,
	unreadUpdates: 2,
	unreadFinished: ["w1", "w2", null],
	finishedHere: ["w1", "w5"],
};

describe("the inbox badge", () => {
	test("counts unread asks, unread updates and each finished workspace once", () => {
		expect(
			inboxBadgeCount({ ...counts, showUpdates: true, showFinished: true }),
		).toBe(3 + 2 + 4);
	});

	test("a hidden type adds nothing", () => {
		expect(
			inboxBadgeCount({ ...counts, showUpdates: false, showFinished: true }),
		).toBe(3 + 4);
		expect(
			inboxBadgeCount({ ...counts, showUpdates: true, showFinished: false }),
		).toBe(3 + 2);
		expect(
			inboxBadgeCount({ ...counts, showUpdates: false, showFinished: false }),
		).toBe(3);
	});

	test("asks always count", () => {
		expect(
			inboxBadgeCount({
				unreadAsks: 1,
				unreadUpdates: 0,
				unreadFinished: [],
				finishedHere: [],
				showUpdates: false,
				showFinished: false,
			}),
		).toBe(1);
	});
});
