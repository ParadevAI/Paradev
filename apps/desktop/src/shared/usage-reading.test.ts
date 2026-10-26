import { describe, expect, test } from "bun:test";
import {
	quotaWindowReading,
	usageObservation,
	usageReading,
} from "./usage-reading";

const now = Date.parse("2026-10-14T07:00:00Z");
const window = {
	usedPercent: 91,
	resetsAt: new Date(now + 60_000),
};
const account = {
	status: "ok",
	checkedAt: new Date(now),
	windows: [window],
};

describe("identity-bound quota display", () => {
	test.each([
		[0, "fresh"],
		[16 * 60_000, "fresh"],
		[16 * 60_000 + 1, "stale"],
		[60 * 60_000, "stale"],
		[60 * 60_000 + 1, "unavailable"],
	] as const)("a %i ms observation has %s freshness", (age, freshness) => {
		const reading = usageReading(
			{ ...account, checkedAt: new Date(now - age) },
			false,
			now,
		);
		expect(reading.freshness).toBe(freshness);
		expect(reading.windows).toEqual(
			freshness === "unavailable" ? [] : [window],
		);
	});

	test.each([
		"token_stale",
		"unavailable",
		"signed_out",
		"token_expired",
	])("%s retains recent verified history without claiming current quota", (status) => {
		const reading = usageReading({ ...account, status }, false, now);
		expect(reading.windows[0]).toBe(window);
		expect(quotaWindowReading(reading, window, now)).toBe("historical");
	});

	test("offline and explicitly historical observations cannot be live", () => {
		for (const reading of [
			usageReading(account, true, now),
			usageReading({ ...account, historical: true }, false, now),
		]) {
			expect(reading.freshness).toBe("stale");
			expect(quotaWindowReading(reading, window, now)).toBe("historical");
		}
	});

	test("a changed identity quarantines numbers and the previous timestamp", () => {
		const reading = usageReading(
			{ ...account, identityChanged: true },
			false,
			now,
		);
		expect(reading).toEqual({
			freshness: "unavailable",
			checkedAt: null,
			windows: [],
		});
		expect(quotaWindowReading(reading, window, now)).toBe("unavailable");
	});

	test("crossing a reset boundary preserves history and never synthesizes allowance", () => {
		const reading = usageReading(account, false, now);
		expect(quotaWindowReading(reading, window, now)).toBe("current");
		expect(quotaWindowReading(reading, window, now + 60_000)).toBe(
			"awaiting_refresh",
		);
		expect(reading.windows[0].usedPercent).toBe(91);
		const refreshed = { usedPercent: 0, resetsAt: new Date(now + 360_000) };
		const next = usageReading(
			{ ...account, windows: [refreshed] },
			false,
			now + 60_000,
		);
		expect(quotaWindowReading(next, refreshed, now + 60_000)).toBe("current");
		expect(next.windows[0].usedPercent).toBe(0);
	});

	test("invalid and implausibly future observations never become current values", () => {
		for (const checkedAt of [null, "invalid", new Date(now + 60_001)]) {
			const reading = usageReading({ ...account, checkedAt }, false, now);
			expect(reading.windows).toEqual([]);
			expect(reading.checkedAt).toBeNull();
		}
		const invalid = { usedPercent: 20, resetsAt: "invalid" };
		const reading = usageReading(
			{ ...account, windows: [invalid] },
			false,
			now,
		);
		expect(quotaWindowReading(reading, invalid, now)).toBe("historical");
		expect(quotaWindowReading(reading, undefined, now)).toBe("unavailable");
	});

	test("nonfinite values are discarded without hiding other recorded windows", () => {
		const reading = usageReading(
			{ ...account, windows: [window, { ...window, usedPercent: NaN }] },
			false,
			now,
		);
		expect(reading.windows).toEqual([window]);
	});
});

test("provider and passive windows keep independent observation ages", () => {
	const provider = {
		...window,
		source: "provider" as const,
		observedAt: new Date(now - 15 * 60_000),
		resetsAt: null,
	};
	const native = {
		...window,
		source: "claude_statusline" as const,
		observedAt: new Date(now),
		resetsAt: null,
	};
	const reading = usageReading(
		{ ...account, windows: [provider, native] },
		false,
		now,
	);
	expect(quotaWindowReading(reading, provider, now)).toBe("current");
	expect(quotaWindowReading(reading, native, now)).toBe("current");
	const old = { ...provider, observedAt: new Date(now - 16 * 60_000 - 1) };
	const mixed = usageReading(
		{ ...account, windows: [old, native] },
		false,
		now,
	);
	expect(quotaWindowReading(mixed, old, now)).toBe("historical");
	expect(quotaWindowReading(mixed, native, now)).toBe("current");
	const staleNative = { ...native, observedAt: new Date(now - 6 * 60_000 - 1) };
	const passive = usageReading(
		{ ...account, windows: [provider, staleNative] },
		false,
		now,
	);
	expect(quotaWindowReading(passive, staleNative, now)).toBe("historical");
});
test("fresh collection cannot revive expired or future per-window observations", () => {
	for (const observedAt of [
		new Date(now - 60 * 60_000 - 1),
		new Date(now + 60_001),
		"invalid",
	]) {
		const recorded = { ...window, observedAt, source: "provider" as const };
		expect(
			usageReading({ ...account, windows: [recorded] }, false, now).windows,
		).toEqual([]);
	}
});

test("fresh native leaves remain visible when the outer HTTP reading has expired", () => {
	const checkedAt = new Date(now - 2 * 60 * 60_000);
	const native = {
		...window,
		resetsAt: null,
		source: "claude_statusline" as const,
		observedAt: new Date(now),
	};
	const oldProvider = {
		...window,
		resetsAt: null,
		source: "provider" as const,
		observedAt: checkedAt,
	};
	const implicitProvider = { ...window, resetsAt: null };
	const reading = usageReading(
		{ ...account, checkedAt, windows: [native, oldProvider, implicitProvider] },
		false,
		now,
	);
	expect(reading.windows).toEqual([native]);
	expect(reading.freshness).toBe("stale");
	expect(reading.checkedAt?.getTime()).toBe(checkedAt.getTime());
	expect(quotaWindowReading(reading, native, now)).toBe("current");
	expect(quotaWindowReading(reading, oldProvider, now)).toBe("unavailable");
	expect(quotaWindowReading(reading, implicitProvider, now)).toBe(
		"unavailable",
	);
});

test("native freshness cannot promote provider siblings or financial observation dates", () => {
	const checkedAt = new Date(now - 20 * 60_000);
	const provider = { ...window, resetsAt: null, source: "provider" as const };
	const native = {
		...window,
		resetsAt: null,
		source: "claude_sdk" as const,
		observedAt: new Date(now),
	};
	const prepaidBalance = { amount: 25, currency: "USD", checkedAt };
	const original = {
		...account,
		fetchedAt: checkedAt,
		windows: [provider, native],
		prepaidBalance,
	};
	const observation = usageObservation(original);
	const reading = usageReading(observation, false, now);
	expect(quotaWindowReading(reading, native, now)).toBe("current");
	expect(quotaWindowReading(reading, provider, now)).toBe("historical");
	expect(reading.freshness).toBe("stale");
	expect(reading.checkedAt?.getTime()).toBe(checkedAt.getTime());
	expect(original.fetchedAt).toBe(checkedAt);
	expect(original.prepaidBalance.checkedAt).toBe(checkedAt);
});

test("own native timestamps need no outer timestamp but retain all availability guards", () => {
	const native = {
		...window,
		resetsAt: null,
		source: "claude_statusline" as const,
		observedAt: new Date(now),
	};
	const input = { ...account, checkedAt: "invalid", windows: [native] };
	const reading = usageReading(input, false, now);
	expect(reading.checkedAt).toBeNull();
	expect(reading.freshness).toBe("stale");
	expect(quotaWindowReading(reading, native, now)).toBe("current");
	for (const unavailable of [
		usageReading(input, true, now),
		usageReading({ ...input, historical: true }, false, now),
		usageReading({ ...input, status: "unavailable" }, false, now),
	]) {
		expect(quotaWindowReading(unavailable, native, now)).toBe("historical");
	}
	expect(
		usageReading({ ...input, identityChanged: true }, false, now).windows,
	).toEqual([]);
});

test("each live window obeys its exact native or provider freshness boundary", () => {
	for (const [source, limit] of [
		["provider", 16 * 60_000],
		["claude_statusline", 6 * 60_000],
		["claude_sdk", 6 * 60_000],
	] as const) {
		for (const [age, state] of [
			[limit, "current"],
			[limit + 1, "historical"],
			[-1, "historical"],
		] as const) {
			const value = {
				...window,
				resetsAt: null,
				source,
				observedAt: new Date(now - age),
			};
			expect(
				quotaWindowReading(
					usageReading({ ...account, windows: [value] }, false, now),
					value,
					now,
				),
			).toBe(state);
		}
	}
});
