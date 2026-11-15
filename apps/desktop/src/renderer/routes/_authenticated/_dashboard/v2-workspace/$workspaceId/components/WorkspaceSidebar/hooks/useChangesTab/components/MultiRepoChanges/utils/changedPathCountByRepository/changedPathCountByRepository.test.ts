import { expect, test } from "bun:test";
import type { ChangesetFile } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/useChangeset";
import { changedPathCountByRepository } from "./changedPathCountByRepository";

const file = (
	repositoryId: string,
	path: string,
	kind: "staged" | "unstaged",
): ChangesetFile => ({
	path,
	status: "modified",
	additions: 1,
	deletions: 0,
	source: { kind },
	repositoryId,
});

test("counts each repository's paths once, staged and unstaged together", () => {
	const counts = changedPathCountByRepository([
		file("web", "a.ts", "unstaged"),
		file("web", "a.ts", "staged"),
		file("web", "b.ts", "staged"),
		file("api", "a.ts", "unstaged"),
	]);
	expect(counts.get("web")).toBe(2);
	expect(counts.get("api")).toBe(1);
	expect(counts.get("docs")).toBeUndefined();
});
