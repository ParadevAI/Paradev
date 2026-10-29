import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import { copyLocalFilesIntoWorktree } from "./attachments";

const roots: string[] = [];

function setup() {
	const root = mkdtempSync(join(tmpdir(), "attachments-"));
	roots.push(root);
	const source = join(root, "build.dmg");
	writeFileSync(source, "first");
	return { root, source, worktreePath: join(root, "worktree") };
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("copyLocalFilesIntoWorktree", () => {
	it("copies into a self-ignoring attachments dir and never overwrites", async () => {
		const { source, worktreePath } = setup();
		const directory = join(worktreePath, WORKSPACE_ATTACHMENTS_DIR);

		expect(
			await copyLocalFilesIntoWorktree({ worktreePath, sourcePaths: [source] }),
		).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/build.dmg`]);
		writeFileSync(source, "second");
		expect(
			await copyLocalFilesIntoWorktree({ worktreePath, sourcePaths: [source] }),
		).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/build_1.dmg`]);

		expect(readFileSync(join(directory, "build.dmg"), "utf8")).toBe("first");
		expect(readFileSync(join(directory, "build_1.dmg"), "utf8")).toBe("second");
		expect(readFileSync(join(directory, ".gitignore"), "utf8")).toBe("*\n");
	});

	it("refuses a directory as the source before writing anything", async () => {
		const { root, worktreePath } = setup();

		await expect(
			copyLocalFilesIntoWorktree({ worktreePath, sourcePaths: [root] }),
		).rejects.toThrow("Not a file");
	});
});
