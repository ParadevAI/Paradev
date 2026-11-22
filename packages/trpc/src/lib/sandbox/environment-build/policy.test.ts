import { describe, expect, test } from "bun:test";
import { STALE_BUILD_MS } from "./limits";
import {
	checkoutScript,
	dailyBuildsPaused,
	goldensToDelete,
	isStale,
	keptGoldenRefs,
	nextManualBuildAt,
} from "./policy";

describe("isStale", () => {
	test("a running build past the stale limit is stale; a finished one never is", () => {
		const old = new Date(Date.now() - STALE_BUILD_MS - 1000);
		const recent = new Date(Date.now() - 1000);
		expect(isStale({ status: "running", startedAt: old })).toBe(true);
		expect(isStale({ status: "running", startedAt: recent })).toBe(false);
		expect(isStale({ status: "failed", startedAt: old })).toBe(false);
	});
});

describe("goldensToDelete", () => {
	const goldens = (...refs: string[]) =>
		refs.map((goldenRef) => ({ goldenRef }));

	test("keeps three goldens", () => {
		expect(goldensToDelete(goldens("c", "b", "a"), "c")).toEqual([]);
	});

	test("deletes the fourth, and never the active one", () => {
		expect(goldensToDelete(goldens("d", "c", "b", "a"), "d")).toEqual(
			goldens("a"),
		);
		expect(goldensToDelete(goldens("d", "c", "b", "a"), "a")).toEqual(
			goldens("b"),
		);
	});

	test("what it keeps can be restored: the active golden plus the 2 newest others", () => {
		expect(keptGoldenRefs(goldens("d", "c", "b", "a"), "a")).toEqual(
			new Set(["a", "d", "c"]),
		);
	});
});

describe("dailyBuildsPaused", () => {
	const failed = { status: "failed" as const };
	const succeeded = { status: "succeeded" as const };

	test("three failures in a row pause; a success among them does not", () => {
		expect(dailyBuildsPaused([failed, failed, failed, succeeded])).toBe(true);
		expect(dailyBuildsPaused([succeeded, failed, failed, failed])).toBe(false);
		expect(dailyBuildsPaused([failed, failed])).toBe(false);
	});
});

describe("checkoutScript", () => {
	test("fetches or clones each checkout and prints the primary's commit", () => {
		const script = checkoutScript({
			root: "/workspace",
			checkouts: [
				{ url: "https://github.com/a/web.git", branch: "main", path: "web" },
				{ url: "https://github.com/a/api.git", branch: "dev", path: "api" },
			],
		});
		expect(script).toContain(
			"git -C '/workspace/web' fetch -q --depth 1 origin 'main'",
		);
		expect(script).toContain(
			"git clone -q --depth 1 --single-branch --branch 'dev' 'https://github.com/a/api.git'",
		);
		expect(script.split("\n").at(-1)).toBe(
			"git -C '/workspace/web' rev-parse HEAD",
		);
	});

	test("quotes a branch name with a quote in it", () => {
		const script = checkoutScript({
			root: "/workspace",
			checkouts: [{ url: "u", branch: "it's", path: "." }],
		});
		expect(script).toContain(`origin 'it'\\''s'`);
	});
});

describe("nextManualBuildAt", () => {
	test("a fourth manual build in an hour waits for the oldest of the three to age out", () => {
		const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 12, minutes));
		expect(nextManualBuildAt([at(10), at(40)])).toBeNull();
		expect(nextManualBuildAt([at(40), at(10), at(25)])).toEqual(
			new Date(Date.UTC(2026, 0, 1, 13, 10)),
		);
	});
});
