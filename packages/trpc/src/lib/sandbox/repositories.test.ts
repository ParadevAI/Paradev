import { describe, expect, test } from "bun:test";
import {
	orderCheckouts,
	type RepositoryRow,
	repositorySetMismatch,
	toSandboxRepositories,
} from "./repositories";

function repository(id: string, fullName: string): RepositoryRow {
	const [owner, name] = fullName.split("/") as [string, string];
	return {
		id,
		fullName,
		owner,
		name,
		defaultBranch: "main",
	} as RepositoryRow;
}

const API = repository("r-api", "acme/api");
const WEB = repository("r-web", "acme/web");
const ARGS = {
	primaryRepositoryId: "r-web",
	primaryBranch: "release",
	workingBranch: "superset/work-1",
};

describe("orderCheckouts", () => {
	test("without a recorded base the primary uses the workspace's base and the others their default", () => {
		const checkouts = orderCheckouts(
			[
				{
					link: { path: "api", baseBranch: null, baseBranchRequired: false },
					repository: API,
				},
				{
					link: { path: "web", baseBranch: null, baseBranchRequired: false },
					repository: WEB,
				},
			],
			ARGS,
		);
		expect(
			checkouts.map((entry) => [
				entry.repository.id,
				entry.baseBranch,
				entry.requireBase,
			]),
		).toEqual([
			["r-web", "release", false],
			["r-api", "main", false],
		]);
	});

	test("a recorded base that is not required wins but keeps the fallback", () => {
		const [web, api] = orderCheckouts(
			[
				{
					link: {
						path: "api",
						baseBranch: "fix-login",
						baseBranchRequired: false,
					},
					repository: API,
				},
				{
					link: { path: "web", baseBranch: null, baseBranchRequired: false },
					repository: WEB,
				},
			],
			ARGS,
		);
		expect([web?.baseBranch, web?.requireBase]).toEqual(["release", false]);
		expect([api?.baseBranch, api?.requireBase]).toEqual(["fix-login", false]);
	});

	test("a required recorded base wins, for the primary too", () => {
		const checkouts = orderCheckouts(
			[
				{
					link: {
						path: "api",
						baseBranch: "superset/teleport-1",
						baseBranchRequired: true,
					},
					repository: API,
				},
				{
					link: {
						path: "web",
						baseBranch: "superset/teleport-1",
						baseBranchRequired: true,
					},
					repository: WEB,
				},
			],
			ARGS,
		);
		expect(
			checkouts.map((entry) => [entry.baseBranch, entry.requireBase]),
		).toEqual([
			["superset/teleport-1", true],
			["superset/teleport-1", true],
		]);
	});
});

describe("toSandboxRepositories", () => {
	test("hands the box requireBase only for a required base", () => {
		const [web, api] = toSandboxRepositories(
			orderCheckouts(
				[
					{
						link: {
							path: "api",
							baseBranch: "feature",
							baseBranchRequired: true,
						},
						repository: API,
					},
					{
						link: { path: "web", baseBranch: null, baseBranchRequired: false },
						repository: WEB,
					},
				],
				ARGS,
			),
		);
		expect(web).toEqual({
			url: "https://github.com/acme/web.git",
			branch: "superset/work-1",
			baseBranch: "release",
			path: "web",
		});
		expect(api).toEqual({
			url: "https://github.com/acme/api.git",
			branch: "superset/work-1",
			baseBranch: "feature",
			requireBase: true,
			path: "api",
		});
	});
});

describe("repositorySetMismatch", () => {
	test("the same set in another order and case is no mismatch", () => {
		expect(repositorySetMismatch([API, WEB], ["Acme/Web", "acme/API"])).toBe(
			null,
		);
	});

	test("names what each side has that the other lacks", () => {
		expect(repositorySetMismatch([API, WEB], ["acme/web", "acme/docs"])).toBe(
			"not in the environment: acme/docs; only in the environment: acme/api",
		);
	});
});
