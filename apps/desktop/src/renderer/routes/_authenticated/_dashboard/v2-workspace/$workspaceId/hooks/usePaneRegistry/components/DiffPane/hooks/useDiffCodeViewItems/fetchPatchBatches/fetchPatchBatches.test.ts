import { describe, expect, mock, test } from "bun:test";
import type { GetDiffPatchInput } from "renderer/lib/diffPatchQuery";
import { MAX_PATCH_REQUEST_PATHS } from "../splitPatchInput";
import { fetchPatchBatches } from "./fetchPatchBatches";

const firstBatch = Array.from(
	{ length: MAX_PATCH_REQUEST_PATHS },
	(_, index) => `file-${index}.ts`,
);
const input = {
	workspaceId: "workspace-1",
	category: "unstaged",
	ignoreWhitespace: true,
	paths: [...firstBatch, "last.ts"],
} as GetDiffPatchInput;

function section(path: string): string {
	return `diff --git a/${path} b/${path}\n@@ -1 +1 @@\n-a\n+b\n`;
}

describe("fetchPatchBatches", () => {
	test("keeps the paths of a complete batch when a later one is truncated", async () => {
		const query = mock(async (batch: GetDiffPatchInput) =>
			batch.paths?.includes("last.ts")
				? { patch: "", truncated: true }
				: { patch: section("file-1.ts"), truncated: false },
		);

		const fetched = await fetchPatchBatches(input, query);

		expect(query).toHaveBeenCalledTimes(2);
		expect(fetched?.whitespaceFilteredPaths).toEqual(firstBatch);
	});

	test("drops the paths of a batch cut by the length bound", async () => {
		const patch = section("file-1.ts");
		const query = mock(async () => ({ patch, truncated: false }));

		const fetched = await fetchPatchBatches(input, query, patch.length + 1);

		expect(fetched?.patch).toBe(patch);
		expect(fetched?.whitespaceFilteredPaths).toEqual(firstBatch);
	});

	test("returns null when the host does not report truncation", async () => {
		const query = mock(async () => ({ patch: section("file-1.ts") }));

		expect(await fetchPatchBatches(input, query)).toBeNull();
		expect(query).toHaveBeenCalledTimes(1);
	});

	test("lists no paths when whitespace is kept", async () => {
		const query = mock(async () => ({ patch: "" }));

		const fetched = await fetchPatchBatches(
			{ ...input, ignoreWhitespace: false },
			query,
		);

		expect(fetched?.whitespaceFilteredPaths).toEqual([]);
	});
});
