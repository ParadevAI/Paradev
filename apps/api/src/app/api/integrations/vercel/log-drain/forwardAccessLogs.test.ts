import { describe, expect, test } from "bun:test";
import { PEEC_ACCESS_LOG_URL } from "./constants";
import { chunk, forwardAccessLogs } from "./forwardAccessLogs";
import type { AccessLogEntry } from "./toAccessLogEntries";

function entries(count: number): AccessLogEntry[] {
	return Array.from({ length: count }, (_, i) => ({
		timestamp: "2026-10-14T00:00:00.000Z",
		request_method: "GET",
		request_url: `https://superset.sh/${i}`,
		response_status: 200,
		user_agent: "GPTBot/1.2",
	}));
}

function recordingFetch(status = 200) {
	const calls: { url: string; init: RequestInit }[] = [];
	const fetchImpl = (async (url: string, init: RequestInit) => {
		calls.push({ url, init });
		return new Response(null, { status });
	}) as unknown as typeof fetch;
	return { calls, fetchImpl };
}

describe("chunk", () => {
	test("splits into chunks of at most the given size", () => {
		expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
		expect(chunk([], 500)).toEqual([]);
	});
});

describe("forwardAccessLogs", () => {
	test("posts at most 500 entries per request with the Peec headers", async () => {
		const { calls, fetchImpl } = recordingFetch();
		const failures = await forwardAccessLogs({
			entries: entries(1001),
			apiKey: "key",
			organizationId: "org",
			fetchImpl,
		});

		expect(failures).toEqual([]);
		expect(
			calls.map((call) => JSON.parse(call.init.body as string).length),
		).toEqual([500, 500, 1]);
		expect(calls[0]?.url).toBe(PEEC_ACCESS_LOG_URL);
		expect(calls[0]?.init.headers).toEqual({
			Authorization: "Bearer key",
			"x-org-id": "org",
			"Content-Type": "application/json",
		});
	});

	test("reports the status of a rejected chunk", async () => {
		const { fetchImpl } = recordingFetch(401);
		const failures = await forwardAccessLogs({
			entries: entries(3),
			apiKey: "key",
			organizationId: "org",
			fetchImpl,
		});
		expect(failures).toEqual([{ entries: 3, status: 401 }]);
	});

	test("reports a timed-out chunk without waiting for the real timeout", async () => {
		const hangingFetch = ((_: string, init: RequestInit) =>
			new Promise((_resolve, reject) => {
				init.signal?.addEventListener("abort", () =>
					reject(init.signal?.reason),
				);
			})) as unknown as typeof fetch;
		const failures = await forwardAccessLogs({
			entries: entries(1),
			apiKey: "key",
			organizationId: "org",
			fetchImpl: hangingFetch,
			timeoutMs: 5,
		});
		expect(failures).toEqual([{ entries: 1, error: "TimeoutError" }]);
	});
});
