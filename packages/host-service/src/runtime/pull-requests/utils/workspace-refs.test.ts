import { describe, expect, test } from "bun:test";
import { branchSinceFromReflog } from "./workspace-refs";

describe("branchSinceFromReflog", () => {
	test("takes the latest checkout onto the branch", () => {
		const reflog = [
			"HEAD@{1794500300}\tcommit: wip",
			"HEAD@{1794500200}\tcheckout: moving from main to release",
			"HEAD@{1794500100}\tcheckout: moving from release to main",
			"HEAD@{1794500000}\tcheckout: moving from main to release",
			"HEAD@{1700000000}\tclone: from https://github.com/o/r.git",
		].join("\n");

		expect(branchSinceFromReflog(reflog, "release")).toBe(1794500200_000);
	});

	test("falls back to the oldest entry when the checkout never switched", () => {
		const reflog = [
			"HEAD@{1794500100}\tcommit: wip",
			"HEAD@{1794500000}\treset: moving to HEAD",
			"HEAD@{1794499999}",
		].join("\n");

		expect(branchSinceFromReflog(reflog, "feature")).toBe(1794499999_000);
	});

	test("is null for an empty reflog", () => {
		expect(branchSinceFromReflog("", "main")).toBeNull();
	});
});
