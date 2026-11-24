import { describe, expect, test } from "bun:test";
import { githubUserTokenIsFresh } from "./github-user";

describe("githubUserTokenIsFresh", () => {
	test("a token a scheduled rule refresh finds (at most 45 min left) is renewed", () => {
		const now = Date.parse("2026-11-19T12:00:00Z");
		const minutes = (n: number) => new Date(now + n * 60_000);
		expect(githubUserTokenIsFresh(minutes(25), now)).toBe(false);
		expect(githubUserTokenIsFresh(minutes(45), now)).toBe(false);
		expect(githubUserTokenIsFresh(minutes(51), now)).toBe(true);
		expect(githubUserTokenIsFresh(null, now)).toBe(true);
	});
});
