import { describe, expect, test } from "bun:test";
import type { ReleaseNote } from "@superset/shared/release-notes";
import {
	getCardRelease,
	getShippedReleases,
	sortReleases,
} from "./selectReleaseNotes";

function release(version: string): ReleaseNote {
	return {
		version,
		date: "2026-10-11",
		title: version,
		url: `https://superset.sh/changelog/${version}`,
		highlights: [{ icon: "sparkles", title: "T", description: "D" }],
	};
}

const feed = [release("1.36.0"), release("1.39.0"), release("1.38.0")];

describe("getShippedReleases", () => {
	test("drops releases newer than the app and sorts newest first", () => {
		expect(getShippedReleases(feed, "1.38.2").map((r) => r.version)).toEqual([
			"1.38.0",
			"1.36.0",
		]);
	});

	test("treats a canary build as its release version", () => {
		expect(
			getShippedReleases(feed, "1.39.0-canary.3").map((r) => r.version),
		).toEqual(["1.39.0", "1.38.0", "1.36.0"]);
	});
});

test("sortReleases keeps releases newer than the app for previews", () => {
	expect(
		sortReleases([...feed, release("not-a-version")]).map((r) => r.version),
	).toEqual(["1.39.0", "1.38.0", "1.36.0"]);
});

describe("getCardRelease", () => {
	const shipped = getShippedReleases(feed, "1.38.0");

	test("shows the newest shipped release after an update", () => {
		expect(
			getCardRelease(shipped, {
				previousVersion: "1.37.0",
				dismissedVersion: null,
			})?.version,
		).toBe("1.38.0");
	});

	test("hides on a fresh install", () => {
		expect(
			getCardRelease(shipped, {
				previousVersion: null,
				dismissedVersion: null,
			}),
		).toBeNull();
	});

	test("stays hidden once that release or a newer one is dismissed", () => {
		expect(
			getCardRelease(shipped, {
				previousVersion: "1.37.0",
				dismissedVersion: "1.38.0",
			}),
		).toBeNull();
		expect(
			getCardRelease(getShippedReleases(feed, "1.39.0"), {
				previousVersion: "1.38.0",
				dismissedVersion: "1.38.0",
			})?.version,
		).toBe("1.39.0");
	});
});
