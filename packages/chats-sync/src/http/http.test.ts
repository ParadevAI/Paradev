import { afterEach, describe, expect, test } from "bun:test";
import {
	ApiError,
	backoffMs,
	isSlowDown,
	request,
	retryDelayMs,
} from "./http.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

const answer = (res: Response) => {
	globalThis.fetch = (async () => res) as unknown as typeof fetch;
};
const failure = (promise: Promise<unknown>) =>
	promise.then(
		() => null,
		(err: unknown) => err as ApiError,
	);

describe("errors", () => {
	test("the API's JSON error keeps its code and message", async () => {
		answer(
			Response.json(
				{ error: "forbidden", message: "Not yours" },
				{ status: 403 },
			),
		);
		const err = await failure(request("https://api.test", "/x"));
		expect([err?.status, err?.code, err?.message]).toEqual([
			403,
			"forbidden",
			"Not yours",
		]);
		expect(isSlowDown(err)).toBe(false);
	});

	test("an edge challenge page (a 403 that isn't JSON) and a 429 mean slow down", async () => {
		answer(
			new Response("<html>Vercel Security Checkpoint</html>", {
				status: 403,
				headers: { "content-type": "text/html" },
			}),
		);
		const challenged = await failure(request("https://api.test", "/x"));
		expect(challenged?.code).toBe("challenged");
		expect(isSlowDown(challenged)).toBe(true);

		answer(
			Response.json(
				{ error: "rate_limited", message: "Too many" },
				{ status: 429, headers: { "retry-after": "42" } },
			),
		);
		const limited = await failure(request("https://api.test", "/x"));
		expect(isSlowDown(limited)).toBe(true);
		expect(limited?.retryAfterMs).toBe(42_000);
	});
});

describe("retry delays", () => {
	test("backoff doubles per attempt up to 15 s, with jitter in the upper half", () => {
		expect([1, 2, 3, 10].map((n) => backoffMs(n, () => 1))).toEqual([
			500, 1000, 2000, 15_000,
		]);
		expect(backoffMs(3, () => 0)).toBe(1000);
	});

	test("after a slow-down the wait starts at up to 30 s, grows to 5 minutes, and is never shorter than the server asked", () => {
		const busy = new ApiError(403, "challenged", "busy");
		expect([1, 2, 5, 10].map((n) => retryDelayMs(busy, n, () => 1))).toEqual([
			30_000, 60_000, 300_000, 300_000,
		]);
		expect(
			retryDelayMs(
				new ApiError(429, "rate_limited", "busy", 120_000),
				1,
				() => 1,
			),
		).toBe(120_000);
		expect(retryDelayMs(new TypeError("offline"), 1, () => 1)).toBe(500);
	});
});
