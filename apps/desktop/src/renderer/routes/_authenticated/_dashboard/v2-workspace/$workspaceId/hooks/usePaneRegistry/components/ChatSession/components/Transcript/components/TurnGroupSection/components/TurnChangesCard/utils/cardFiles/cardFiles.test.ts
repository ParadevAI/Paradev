import { describe, expect, test } from "bun:test";
import type { TurnChanges } from "@superset/chat-runtime";
import type { TurnFileChange } from "../../../../../../utils/turnChangedFiles";
import { cardFiles } from "./cardFiles";

const ROOT = "/work/repo";

const toolFiles: TurnFileChange[] = [
	{
		path: `${ROOT}/src/b.ts`,
		kind: "modified",
		stats: { additions: 9, deletions: 9 },
		line: 12,
	},
	{ path: `${ROOT}/src/a.ts`, kind: "added", stats: null },
];

function snapshot(shared: boolean): TurnChanges {
	return {
		root: ROOT,
		before: "b1",
		after: "a1",
		live: false,
		shared,
		undone: false,
		committed: [],
		files: [
			{ path: "NOTES.md", status: "added", additions: 1, deletions: 0 },
			{ path: "src/a.ts", status: "added", additions: 4, deletions: 0 },
			{ path: "src/b.ts", status: "modified", additions: 2, deletions: 1 },
			{
				path: "logo.png",
				status: "modified",
				additions: null,
				deletions: null,
			},
		],
	};
}

const summary = (rows: ReturnType<typeof cardFiles>["files"]) =>
	rows.map((row) => [row.place.relativePath, row.kind, row.stats, row.line]);

describe("cardFiles", () => {
	test("takes a turn's snapshots over its tool calls, shell edits included", () => {
		const { files, others } = cardFiles(toolFiles, snapshot(false), ROOT);

		expect(summary(files)).toEqual([
			["src/b.ts", "modified", { additions: 2, deletions: 1 }, 12],
			["src/a.ts", "added", { additions: 4, deletions: 0 }, undefined],
			["NOTES.md", "added", { additions: 1, deletions: 0 }, undefined],
			["logo.png", "modified", null, undefined],
		]);
		expect(others).toEqual([]);
	});

	test("lists what others changed apart when the turn shared its worktree", () => {
		const { files, others } = cardFiles(toolFiles, snapshot(true), ROOT);

		expect(files.map((row) => row.place.relativePath)).toEqual([
			"src/b.ts",
			"src/a.ts",
		]);
		expect(others.map((row) => row.place.relativePath)).toEqual([
			"NOTES.md",
			"logo.png",
		]);
	});

	test("lists every file and claims none when a shared turn edited only through the shell", () => {
		const { files, others, own } = cardFiles([], snapshot(true), ROOT);

		expect(files.map((row) => row.place.relativePath)).toEqual([
			"NOTES.md",
			"src/a.ts",
			"src/b.ts",
			"logo.png",
		]);
		expect(others).toEqual([]);
		expect(own).toBe(false);
	});

	test("drops files committed since the turn, and has nothing left once all are", () => {
		const some = cardFiles(
			toolFiles,
			{ ...snapshot(false), committed: ["src/a.ts", "NOTES.md"] },
			ROOT,
		);
		const all = cardFiles(
			toolFiles,
			{
				...snapshot(false),
				committed: ["NOTES.md", "src/a.ts", "src/b.ts", "logo.png"],
			},
			ROOT,
		);

		expect(some.files.map((row) => row.place.relativePath)).toEqual([
			"src/b.ts",
			"logo.png",
		]);
		expect(all.files).toEqual([]);
	});

	test("falls back to the tool calls without snapshots", () => {
		const { files } = cardFiles(toolFiles, null, ROOT);

		expect(summary(files)).toEqual([
			["src/b.ts", "modified", { additions: 9, deletions: 9 }, 12],
			["src/a.ts", "added", null, undefined],
		]);
	});
});
