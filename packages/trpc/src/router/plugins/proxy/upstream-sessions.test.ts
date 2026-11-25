import { describe, expect, spyOn, test } from "bun:test";
import { memoryRedis, unreachableRedis } from "../../../../test/session-redis";
import { upstreamSessions } from "./upstream-sessions";

const SESSION = { sessionId: "vendor-1", protocolVersion: "2025-06-18" };

describe("upstreamSessions", () => {
	test("one user cannot read another user's session under the same caller id", async () => {
		const { redis } = memoryRedis();
		await upstreamSessions(redis, "user-a", "caller-1").claim("conn", SESSION);

		expect(
			await upstreamSessions(redis, "user-b", "caller-1").get("conn"),
		).toBeNull();
		expect(
			await upstreamSessions(redis, "user-a", "caller-1").get("conn"),
		).toEqual(SESSION);
	});

	test("the first claim wins and only a claim sets the expiry", async () => {
		const { redis, expired } = memoryRedis();
		const sessions = upstreamSessions(redis, "user-a", "caller-1");

		expect(await sessions.claim("conn", SESSION)).toBe(true);
		expect(
			await sessions.claim("conn", { ...SESSION, sessionId: "vendor-2" }),
		).toBe(false);
		expect(await sessions.get("conn")).toEqual(SESSION);
		expect(expired).toHaveLength(1);
	});

	test("drop and takeAll empty the store", async () => {
		const { redis, hashes } = memoryRedis();
		const sessions = upstreamSessions(redis, "user-a", "caller-1");
		await sessions.claim("conn-1", SESSION);
		await sessions.claim("conn-2", SESSION);

		await sessions.drop("conn-1");
		expect(await sessions.takeAll()).toEqual({ "conn-2": SESSION });
		expect(hashes.size).toBe(0);
	});

	test("a store that cannot be reached holds nothing, throws nothing and warns once", async () => {
		const warn = spyOn(console, "warn").mockImplementation(() => {});
		const sessions = upstreamSessions(unreachableRedis(), "user-a", "caller-1");
		try {
			expect(await sessions.get("conn")).toBeNull();
			expect(await sessions.claim("conn", SESSION)).toBe(false);
			await sessions.touch();
			await sessions.drop("conn");
			expect(await sessions.takeAll()).toEqual({});
			expect(warn).toHaveBeenCalledTimes(1);
		} finally {
			warn.mockRestore();
		}
	});
});
