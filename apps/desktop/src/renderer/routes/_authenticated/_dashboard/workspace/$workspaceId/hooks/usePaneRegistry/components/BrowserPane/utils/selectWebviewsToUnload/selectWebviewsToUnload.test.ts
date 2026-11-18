import { describe, expect, test } from "bun:test";
import {
	selectWebviewsToUnload,
	type UnloadCandidate,
	type UnloadPolicy,
} from "./selectWebviewsToUnload";

const MB = 1024;
const policy: UnloadPolicy = {
	now: 10_000,
	budgetKb: 600 * MB,
	minLoaded: 3,
	maxLoaded: 20,
	idleMs: Number.POSITIVE_INFINITY,
};
const page = (
	paneId: string,
	lastUsedAt: number,
	memoryKb = 150 * MB,
	keepLoaded = false,
): UnloadCandidate => ({ paneId, lastUsedAt, memoryKb, keepLoaded });

describe("selectWebviewsToUnload", () => {
	test("keeps every page that fits the memory budget, however many", () => {
		const pages = Array.from({ length: 12 }, (_, i) =>
			page(`p${i}`, i, 40 * MB),
		);
		expect(selectWebviewsToUnload(pages, policy)).toEqual([]);
	});

	test("unloads the oldest pages until the rest fit, but never the newest few", () => {
		const pages = [1, 2, 3, 4, 5, 6].map((i) => page(`p${i}`, i));
		expect(selectWebviewsToUnload(pages, policy)).toEqual(["p1", "p2"]);
		const huge = [1, 2, 3, 4].map((i) => page(`p${i}`, i, 900 * MB));
		expect(selectWebviewsToUnload(huge, policy)).toEqual(["p1"]);
	});

	test("never unloads a page it must keep, but counts its memory", () => {
		const pages = [
			page("audio", 1, 300 * MB, true),
			page("p2", 2),
			page("p3", 3),
			page("p4", 4),
			page("p5", 5),
		];
		expect(selectWebviewsToUnload(pages, policy)).toEqual(["p2"]);
		expect(selectWebviewsToUnload(pages.slice(1), policy)).toEqual([]);
	});

	test("a protected page among the newest few counts toward the pages kept", () => {
		const pages = [
			page("p1", 1),
			page("p2", 2),
			page("p3", 3),
			page("kept", 4, 150 * MB, true),
		];
		expect(
			selectWebviewsToUnload(pages, { ...policy, budgetKb: 400 * MB }),
		).toEqual(["p1"]);
	});

	test("unloads the oldest pages past the page limit, even under budget", () => {
		const pages = Array.from({ length: 23 }, (_, i) => page(`p${i}`, i, MB));
		expect(selectWebviewsToUnload(pages, policy)).toEqual(["p0", "p1", "p2"]);
	});

	test("unloads pages idle past the limit even under budget", () => {
		const pages = [page("old", 1, MB), page("new", 9_500, MB)];
		expect(selectWebviewsToUnload(pages, { ...policy, idleMs: 5_000 })).toEqual(
			["old"],
		);
	});
});
