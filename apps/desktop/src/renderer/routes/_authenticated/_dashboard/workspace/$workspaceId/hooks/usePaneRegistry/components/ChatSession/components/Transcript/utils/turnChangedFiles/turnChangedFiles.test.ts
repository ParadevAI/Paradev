import { describe, expect, test } from "bun:test";
import type { ToolCall } from "@superset/chat/protocol";
import { turnChangedFiles } from "./turnChangedFiles";

let nextId = 0;

function call(overrides: Partial<ToolCall>): ToolCall {
	nextId++;
	return {
		id: `tool-${nextId}`,
		kind: "tool_call",
		title: "Edit",
		toolKind: "edit",
		toolName: "Edit",
		status: "completed",
		startedAtMs: nextId,
		content: [],
		...overrides,
	};
}

function diff(
	path: string,
	oldText: string | null,
	newText: string,
	deleted?: boolean,
): ToolCall["content"][number] {
	return {
		type: "diff",
		path,
		oldText,
		newText,
		...(deleted ? { deleted } : {}),
	};
}

describe("turnChangedFiles", () => {
	test("lists a file once, in first-touch order, summing every call's hunks", () => {
		const files = turnChangedFiles([
			call({ content: [diff("/repo/b.ts", "x\n", "y\n")] }),
			call({ content: [diff("/repo/a.ts", "1\n", "2\n3\n")] }),
			call({ content: [diff("/repo/b.ts", "y\n", "z\n")] }),
		]);

		expect(files.map((file) => [file.path, file.stats])).toEqual([
			["/repo/b.ts", { additions: 2, deletions: 2 }],
			["/repo/a.ts", { additions: 2, deletions: 1 }],
		]);
	});

	test("marks files the turn created or deleted, and drops one it did both to", () => {
		const files = turnChangedFiles([
			call({ content: [diff("/repo/new.ts", null, "a\n")] }),
			call({ content: [diff("/repo/new.ts", "a\n", "b\n")] }),
			call({ content: [diff("/repo/old.ts", "gone\n", "", true)] }),
			call({ content: [diff("/repo/scratch.ts", null, "tmp\n")] }),
			call({
				toolKind: "delete",
				content: [diff("/repo/scratch.ts", "tmp\n", "")],
			}),
		]);

		expect(files).toEqual([
			{
				path: "/repo/new.ts",
				kind: "added",
				stats: { additions: 2, deletions: 0 },
			},
			{
				path: "/repo/old.ts",
				kind: "deleted",
				stats: { additions: 0, deletions: 1 },
			},
		]);
	});

	test("names the files of calls whose bodies are not loaded, without stats", () => {
		const files = turnChangedFiles([
			call({
				bodyOmitted: true,
				locations: [
					{ path: "/repo/a.ts", line: 12 },
					{ path: "/repo/a.ts", line: 40 },
				],
			}),
		]);

		expect(files).toEqual([
			{ path: "/repo/a.ts", kind: "modified", stats: null, line: 12 },
		]);
	});

	test("ignores calls that did not complete", () => {
		const files = turnChangedFiles([
			call({ status: "failed", content: [diff("/repo/a.ts", "1", "2")] }),
			call({ status: "declined", content: [diff("/repo/b.ts", "1", "2")] }),
			call({ toolKind: "read", locations: [{ path: "/repo/c.ts" }] }),
		]);

		expect(files).toEqual([]);
	});

	test("points at the first changed line, past a hunk's leading context", () => {
		const files = turnChangedFiles([
			call({
				content: [
					diff("/repo/a.ts", "keep\nkeep\nold\nkeep", "keep\nkeep\nnew\nkeep"),
				],
				locations: [{ path: "/repo/a.ts", line: 30 }],
			}),
		]);

		expect(files[0]?.line).toBe(32);
	});
});
