import { describe, expect, test } from "bun:test";
import { buildCheckouts } from "./buildCheckouts";

const api = { id: "r-api", name: "api" };
const web = { id: "r-web", name: "web" };

describe("buildCheckouts", () => {
	test("a bare value names the only repository", () => {
		expect(
			buildCheckouts({ repositories: [api], pr: ["7"], baseBranch: ["main"] }),
		).toEqual({ "r-api": { pr: 7, baseBranch: "main" } });
	});

	test("repeatable <repository>=<value>, by name (any case) or id", () => {
		expect(
			buildCheckouts({
				repositories: [api, web],
				pr: ["Web=12"],
				baseBranch: ["r-api=release/1", "web=main"],
			}),
		).toEqual({
			"r-web": { pr: 12, baseBranch: "main" },
			"r-api": { baseBranch: "release/1" },
		});
	});

	test("refuses a bare value with several repositories, an unknown name, a repeat and a bad number", () => {
		expect(() =>
			buildCheckouts({ repositories: [api, web], pr: ["7"] }),
		).toThrow(/needs a repository/);
		expect(() =>
			buildCheckouts({ repositories: [api, web], pr: ["docs=7"] }),
		).toThrow(/no repository "docs"/);
		expect(() =>
			buildCheckouts({ repositories: [api, web], pr: ["api=1", "api=2"] }),
		).toThrow(/given twice/);
		for (const pr of ["x", "12abc", "1e3", "0", "12345678901234567890"]) {
			expect(() => buildCheckouts({ repositories: [api], pr: [pr] })).toThrow(
				/not a pull request number/,
			);
		}
	});

	test("with one repository, a prefix that names no repository is part of the branch", () => {
		expect(
			buildCheckouts({ repositories: [api], baseBranch: ["feat=x"] }),
		).toEqual({ "r-api": { baseBranch: "feat=x" } });
		expect(
			buildCheckouts({ repositories: [api], baseBranch: ["api=feat=x"] }),
		).toEqual({ "r-api": { baseBranch: "feat=x" } });
	});

	test("nothing given is no checkouts", () => {
		expect(buildCheckouts({ repositories: [api] })).toBeUndefined();
	});
});
