import { describe, expect, test } from "bun:test";
import {
	buildKind,
	checkoutScript,
	dailyBuildsPaused,
	failureTail,
	goldensToDelete,
	isStale,
	STALE_BUILD_MS,
} from "./policy";

describe("buildKind", () => {
	test("forks a golden, and builds from the image when there is none", () => {
		expect(buildKind("fork")).toBe("incremental");
		expect(buildKind("image")).toBe("fresh");
	});
});

describe("isStale", () => {
	const startedAt = new Date(0);

	test("a running build past the limit is stale; a finished one never is", () => {
		expect(isStale({ status: "running", startedAt }, STALE_BUILD_MS + 1)).toBe(
			true,
		);
		expect(isStale({ status: "running", startedAt }, STALE_BUILD_MS)).toBe(
			false,
		);
		expect(isStale({ status: "failed", startedAt }, STALE_BUILD_MS * 2)).toBe(
			false,
		);
	});
});

describe("goldensToDelete", () => {
	const built = (goldenRef: string) => ({
		status: "succeeded" as const,
		goldenRef,
		goldenDeletedAt: null,
	});

	test("keeps the newest five and deletes the rest", () => {
		const builds = ["g7", "g6", "g5", "g4", "g3", "g2", "g1"].map(built);
		expect(goldensToDelete(builds, "g7").map((b) => b.goldenRef)).toEqual([
			"g2",
			"g1",
		]);
	});

	test("never deletes the active golden, even when it is old", () => {
		const builds = ["g6", "g5", "g4", "g3", "g2", "g1"].map(built);
		expect(goldensToDelete(builds, "g1")).toEqual([]);
	});

	test("failed and already deleted builds do not count toward the five", () => {
		const builds = [
			built("g6"),
			{ status: "failed" as const, goldenRef: null, goldenDeletedAt: null },
			built("g5"),
			{ ...built("g0"), goldenDeletedAt: new Date(0) },
			built("g4"),
			built("g3"),
			built("g2"),
			built("g1"),
		];
		expect(goldensToDelete(builds, "g6").map((b) => b.goldenRef)).toEqual([
			"g1",
		]);
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

	test("a lone repository is the workspace root", () => {
		const script = checkoutScript({
			root: "/workspace",
			checkouts: [
				{ url: "https://github.com/a/web.git", branch: "main", path: "." },
			],
		});
		expect(script).toContain("git -C '/workspace' rev-parse HEAD");
	});

	test("quotes a branch name with a quote in it", () => {
		const script = checkoutScript({
			root: "/workspace",
			checkouts: [{ url: "u", branch: "it's", path: "." }],
		});
		expect(script).toContain(`origin 'it'\\''s'`);
	});
});

describe("failureTail", () => {
	test("keeps the last forty lines", () => {
		const output = Array.from({ length: 50 }, (_, i) => `line ${i}`).join("\n");
		const tail = failureTail(`${output}\n`).split("\n");
		expect(tail).toHaveLength(40);
		expect(tail[0]).toBe("line 10");
	});
});
