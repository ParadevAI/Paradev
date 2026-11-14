import { describe, expect, test } from "bun:test";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import {
	changesTreePath,
	fileCheckout,
	groupFilesByRepository,
} from "./repositoryTree";

const web = { repositoryId: "r-web", name: "web", path: "/ws/web" };
const api = { repositoryId: "r-api", name: "api", path: "/ws/api" };
const repositories = [api, web];

const file = (
	repositoryId: string | undefined,
	path: string,
	additions = 1,
	deletions = 0,
): ChangesetFile => ({
	path,
	status: "modified",
	additions,
	deletions,
	source: { kind: "unstaged" },
	repositoryId,
});

describe("changesTreePath", () => {
	test("puts a file under its repository's folder", () => {
		expect(changesTreePath(file("r-web", "src/app.tsx"), repositories)).toBe(
			"web/src/app.tsx",
		);
	});

	test("keeps the path in a list of one checkout", () => {
		expect(changesTreePath(file(undefined, "src/app.tsx"), undefined)).toBe(
			"src/app.tsx",
		);
	});
});

describe("fileCheckout", () => {
	test("finds the checkout of a tagged file, else uses the list's own", () => {
		const own = { repositoryId: "r-own", worktreePath: "/own" };
		expect(fileCheckout(file("r-api", "a.ts"), own, repositories)).toEqual({
			repositoryId: "r-api",
			worktreePath: "/ws/api",
		});
		expect(fileCheckout(file(undefined, "a.ts"), own, undefined)).toBe(own);
	});
});

describe("groupFilesByRepository", () => {
	test("groups in repository order with totals and leaves out empty repositories", () => {
		const files = [
			file("r-web", "a.ts", 3, 1),
			file("r-web", "b.ts", 2, 2),
			file("r-gone", "c.ts"),
		];
		expect(groupFilesByRepository(files, repositories)).toEqual([
			{
				repository: web,
				files: [files[0], files[1]] as ChangesetFile[],
				additions: 5,
				deletions: 3,
			},
		]);
	});
});
