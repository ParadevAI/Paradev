import { describe, expect, test } from "bun:test";
import {
	normalizeGithubLogin,
	normalizeGithubLogins,
} from "./normalizeGithubLogins";

describe("normalizeGithubLogin", () => {
	test("normalizes GitHub usernames and bot logins", () => {
		expect(normalizeGithubLogin(" @octo-cat ")).toBe("octo-cat");
		expect(normalizeGithubLogin("dependabot[bot]")).toBe("dependabot[bot]");
	});

	test("rejects empty and query-injection values", () => {
		expect(normalizeGithubLogin("  ")).toBeNull();
		expect(normalizeGithubLogin("octo--cat")).toBeNull();
		expect(normalizeGithubLogin("octocat author:someone-else")).toBeNull();
		expect(normalizeGithubLogin(42)).toBeNull();
	});
});

describe("normalizeGithubLogins", () => {
	test("preserves legacy single-author links and normalizes multiple authors", () => {
		expect(normalizeGithubLogins(" @octocat ")).toBe("octocat");
		expect(
			normalizeGithubLogins(" @octocat, teammate, OCTOCAT, dependabot[bot] "),
		).toBe("octocat,teammate,dependabot[bot]");
	});
	test("rejects malformed lists and injected search qualifiers", () => {
		for (const value of [
			null,
			42,
			"",
			"alice,",
			"alice,bob author:carol",
			"alice,octo--cat",
		]) {
			expect(normalizeGithubLogins(value)).toBeNull();
		}
	});
	test("bounds persisted selections", () => {
		expect(
			normalizeGithubLogins(
				Array.from({ length: 30 }, (_, i) => `user${i}`).join(","),
			)?.split(","),
		).toHaveLength(20);
	});
});
