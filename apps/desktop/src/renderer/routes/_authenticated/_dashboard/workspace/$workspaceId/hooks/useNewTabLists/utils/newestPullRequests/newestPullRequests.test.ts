import { describe, expect, test } from "bun:test";
import { newestPullRequests } from "./newestPullRequests";

describe("newestPullRequests", () => {
	test("newest link first, each PR once even across a repository rename", () => {
		const prs = newestPullRequests([
			{ url: "github.com/old/repo/pull/1", number: 1, linkedAt: 1 },
			{ url: "github.com/new/repo/pull/2", number: 2, linkedAt: 3 },
			{ url: "github.com/new/repo/pull/1", number: 1, linkedAt: 2 },
		]);
		expect(prs.map((pr) => pr.url)).toEqual([
			"github.com/new/repo/pull/2",
			"github.com/new/repo/pull/1",
		]);
	});
});
