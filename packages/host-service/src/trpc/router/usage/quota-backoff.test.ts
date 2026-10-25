import { expect, test } from "bun:test";
import {
	copyQuotaRetry,
	quotaRetryDelay,
	readQuotaRetry,
	readQuotaRetryHint,
	recordQuotaRetry,
} from "./quota-backoff";

test("Retry-After accepts HTTP dates and integer seconds with bounded invalid input", () => {
	const now = Date.UTC(2026, 9, 14);
	expect(quotaRetryDelay("120", now)).toBe(120_000);
	expect(quotaRetryDelay(new Date(now + 300_000).toUTCString(), now)).toBe(
		300_000,
	);
	for (const value of [null, "nonsense", "-1", "1.5", "9".repeat(400)])
		expect(quotaRetryDelay(value, now)).toBe(0);
	expect(quotaRetryDelay("9999999999", now)).toBe(24 * 60 * 60_000);
});
test("rate limits get a minimum five-minute pause while ordinary authorization errors do not", () => {
	expect(
		readQuotaRetry(recordQuotaRetry({}, new Response("", { status: 429 }))),
	).toBe(300_000);
	expect(
		readQuotaRetry(recordQuotaRetry({}, new Response("", { status: 401 }))),
	).toBe(0);
});

test("transient provider failures get a private retry hint but authentication rejection does not", () => {
	for (const status of [408, 500, 502, 503, 504, 529]) {
		const value = recordQuotaRetry({}, new Response("", { status }));
		expect(readQuotaRetry(value)).toBe(30_000);
		expect(readQuotaRetryHint(value)?.kind).toBe("transient");
		expect(JSON.stringify(value)).toBe("{}");
	}
	for (const status of [400, 401, 403, 404])
		expect(
			readQuotaRetry(recordQuotaRetry({}, new Response("", { status }))),
		).toBe(0);
});

test("copying or reusing a response cannot retain an unrelated previous retry hint", () => {
	const limited = recordQuotaRetry({}, new Response("", { status: 429 }));
	const target = copyQuotaRetry(limited, {});
	expect(readQuotaRetryHint(target)).toBe(readQuotaRetryHint(limited));
	copyQuotaRetry({}, target);
	expect(readQuotaRetry(target)).toBe(0);
	recordQuotaRetry(limited, new Response("", { status: 200 }));
	expect(readQuotaRetry(limited)).toBe(0);
});
