import { expect, test } from "bun:test";
import {
	QUOTA_NATIVE_FRESHNESS_MS,
	QUOTA_PROVIDER_FRESHNESS_MS,
	quotaObservationFresh,
	quotaObservationFreshnessMs,
} from "./quota-freshness";

const now = Date.parse("2026-10-25T12:00:00Z");

test("provider observations remain current across a fifteen-minute collection interval", () => {
	for (const source of [undefined, "provider"]) {
		expect(quotaObservationFreshnessMs(source)).toBe(
			QUOTA_PROVIDER_FRESHNESS_MS,
		);
		for (const minutes of [0, 6, 9, 14, 15, 16])
			expect(
				quotaObservationFresh(
					{ source },
					new Date(now - minutes * 60_000),
					now,
				),
			).toBe(true);
		expect(
			quotaObservationFresh(
				{ source },
				new Date(now - QUOTA_PROVIDER_FRESHNESS_MS - 1),
				now,
			),
		).toBe(false);
	}
});

test("each native observation has its own six-minute lifetime", () => {
	for (const source of ["claude_statusline", "claude_sdk"]) {
		expect(quotaObservationFreshnessMs(source)).toBe(QUOTA_NATIVE_FRESHNESS_MS);
		expect(
			quotaObservationFresh(
				{ source, observedAt: new Date(now - QUOTA_NATIVE_FRESHNESS_MS) },
				new Date(now - 60 * 60_000),
				now,
			),
		).toBe(true);
		expect(
			quotaObservationFresh(
				{ source, observedAt: new Date(now - QUOTA_NATIVE_FRESHNESS_MS - 1) },
				new Date(now),
				now,
			),
		).toBe(false);
	}
});

test("explicit dates take precedence without changing either independent observation", () => {
	const http = new Date(now - 60 * 60_000);
	const native = {
		source: "claude_statusline",
		observedAt: new Date(now - 60_000),
	};
	const oldProvider = {
		source: "provider",
		observedAt: new Date(now - 17 * 60_000),
	};
	expect(quotaObservationFresh(native, http, now)).toBe(true);
	expect(quotaObservationFresh(oldProvider, native.observedAt, now)).toBe(
		false,
	);
	expect(http.getTime()).toBe(now - 60 * 60_000);
	expect(native.observedAt.getTime()).toBe(now - 60_000);
});

test("unknown sources, invalid timestamps and future dates never become current", () => {
	for (const source of [null, "unknown", "claude_future"])
		expect(
			quotaObservationFresh(
				{ source, observedAt: new Date(now) },
				new Date(now),
				now,
			),
		).toBe(false);
	for (const observedAt of ["invalid", new Date(Number.NaN), new Date(now + 1)])
		expect(
			quotaObservationFresh(
				{ source: "provider", observedAt },
				new Date(now),
				now,
			),
		).toBe(false);
	expect(quotaObservationFresh({}, undefined, now)).toBe(false);
	expect(quotaObservationFresh({}, null, now)).toBe(false);
	expect(quotaObservationFresh({}, new Date(now), Number.NaN)).toBe(false);
});
