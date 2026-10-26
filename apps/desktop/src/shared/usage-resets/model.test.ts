import { expect, test } from "bun:test";
import { liveResetCredits, resetExpiryUrgency } from "./model";

const now = Date.now();
test("unknown and stale inventory cannot advertise usable credits", () => {
	expect(liveResetCredits(undefined, now)).toBeNull();
	expect(
		liveResetCredits(
			{ checkedAt: new Date(now), availableCount: null, expirations: null },
			now,
		),
	).toBeNull();
	expect(
		liveResetCredits(
			{
				checkedAt: new Date(now - 360001),
				availableCount: 3,
				expirations: null,
			},
			now,
		),
	).toBeNull();
	expect(
		liveResetCredits(
			{
				checkedAt: new Date(now + 61000),
				availableCount: 3,
				expirations: null,
			},
			now,
		),
	).toBeNull();
});
test("expired credits disappear locally even before the next poll", () => {
	const data = {
		checkedAt: new Date(now),
		availableCount: 3,
		expirations: [new Date(now - 1), new Date(now + 1000), null],
	};
	expect(liveResetCredits(data, now)?.count).toBe(2);
	expect(liveResetCredits(data, now)?.nextExpiry?.getTime()).toBe(now + 1000);
	expect(liveResetCredits(data, now + 2000)?.count).toBe(1);
	expect(liveResetCredits({ ...data, expirations: null }, now)?.count).toBe(3);
});

test("reset expiry urgency uses the earliest live credit with inclusive boundaries", () => {
	const day = 24 * 60 * 60_000;
	for (const [days, expected] of [
		[1, "urgent"],
		[1.01, "soon"],
		[3, "soon"],
		[3.01, "week"],
		[7, "week"],
		[7.01, "available"],
	] as const) {
		expect(resetExpiryUrgency(new Date(now + days * day), now)).toBe(expected);
	}
	expect(resetExpiryUrgency(null, now)).toBe("available");
	const credits = liveResetCredits(
		{
			checkedAt: new Date(now),
			availableCount: 4,
			expirations: [
				new Date(now - 1),
				new Date(now + 8 * day),
				new Date(now + day),
				null,
			],
		},
		now,
	);
	expect(credits?.count).toBe(3);
	expect(resetExpiryUrgency(credits?.nextExpiry ?? null, now)).toBe("urgent");
});
