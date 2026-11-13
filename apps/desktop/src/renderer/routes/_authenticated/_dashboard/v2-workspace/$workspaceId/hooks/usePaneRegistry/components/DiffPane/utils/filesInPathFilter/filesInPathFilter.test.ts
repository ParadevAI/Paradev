import { describe, expect, it } from "bun:test";
import { rootFilePath } from "../../../../../../utils/rootFilePath";
import type { ChangesetFile } from "../../../../../useChangeset";
import { filesInPathFilter } from "./filesInPathFilter";

const checkouts = [
	{ repositoryId: "repo-api", name: "api" },
	{ repositoryId: "repo-web", name: "web" },
];

function file(
	path: string,
	repositoryId?: string,
	oldPath?: string,
): ChangesetFile {
	return {
		path,
		oldPath,
		repositoryId,
		status: oldPath ? "renamed" : "modified",
		additions: 1,
		deletions: 0,
		source: { kind: "unstaged" },
	};
}

describe("filesInPathFilter", () => {
	it("matches a chat turn's root paths to checkout files in a multi-repo workspace", () => {
		const files = [
			file("src/x.ts", "repo-api"),
			file("src/x.ts", "repo-web"),
			file("src/new.ts", "repo-web", "src/old.ts"),
		];
		const matched = filesInPathFilter(
			files,
			["api/src/x.ts", "web/src/old.ts"],
			(f, path) => rootFilePath(checkouts, f.repositoryId, path),
		);
		expect(matched).toEqual([files[0], files[2]]);
	});

	it("matches checkout paths as they are with one checkout", () => {
		const files = [file("src/x.ts"), file("src/y.ts")];
		expect(filesInPathFilter(files, ["src/y.ts"], (_f, path) => path)).toEqual([
			files[1],
		]);
	});
});
