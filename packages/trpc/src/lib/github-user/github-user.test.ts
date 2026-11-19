import { describe, expect, test } from "bun:test";
import { githubUserTokenIsFresh } from "./github-user";

describe("githubUserTokenIsFresh", () => {
	test("a token that would expire before a box's next 30-minute refresh is renewed", () => {
		const now = Date.parse("2026-11-19T12:00:00Z");
		const minutes = (n: number) => new Date(now + n * 60_000);
		expect(githubUserTokenIsFresh(minutes(25), now)).toBe(false);
		expect(githubUserTokenIsFresh(minutes(39), now)).toBe(false);
		expect(githubUserTokenIsFresh(minutes(41), now)).toBe(true);
		expect(githubUserTokenIsFresh(null, now)).toBe(true);
	});
});
