import { afterEach, describe, expect, it } from "bun:test";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import { writeAttachmentsIntoWorktree } from "./attachments";

const roots: string[] = [];

function setup() {
	const root = mkdtempSync(join(tmpdir(), "attachments-"));
	roots.push(root);
	const source = join(root, "build.dmg");
	writeFileSync(source, "first");
	const worktreePath = join(root, "worktree");
	mkdirSync(worktreePath);
	return {
		root,
		source,
		worktreePath,
		directory: join(worktreePath, WORKSPACE_ATTACHMENTS_DIR),
	};
}

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe("writeAttachmentsIntoWorktree", () => {
	it("copies paths and writes bytes in order, into a self-ignoring dir", async () => {
		const { source, worktreePath, directory } = setup();

		const paths = await writeAttachmentsIntoWorktree({
			worktreePath,
			items: [
				{ kind: "path", sourcePath: source },
				{
					kind: "base64",
					name: "image.png",
					data: Buffer.from("png").toString("base64"),
				},
			],
		});

		expect(paths).toEqual([
			`${WORKSPACE_ATTACHMENTS_DIR}/build.dmg`,
			`${WORKSPACE_ATTACHMENTS_DIR}/image.png`,
		]);
		expect(readFileSync(join(directory, "build.dmg"), "utf8")).toBe("first");
		expect(readFileSync(join(directory, "image.png"), "utf8")).toBe("png");
		expect(readFileSync(join(directory, ".gitignore"), "utf8")).toBe("*\n");
	});

	it("never overwrites an earlier attachment", async () => {
		const { source, worktreePath, directory } = setup();
		const items = [{ kind: "path" as const, sourcePath: source }];

		await writeAttachmentsIntoWorktree({ worktreePath, items });
		writeFileSync(source, "second");
		expect(await writeAttachmentsIntoWorktree({ worktreePath, items })).toEqual(
			[`${WORKSPACE_ATTACHMENTS_DIR}/build_1.dmg`],
		);
		expect(readFileSync(join(directory, "build.dmg"), "utf8")).toBe("first");
	});

	it("refuses a directory or a UNC path as a source before writing anything", async () => {
		const { root, worktreePath, directory } = setup();

		for (const sourcePath of [root, "//server/share/x.png"]) {
			await expect(
				writeAttachmentsIntoWorktree({
					worktreePath,
					items: [{ kind: "path", sourcePath }],
				}),
			).rejects.toThrow();
		}
		expect(existsSync(directory)).toBe(false);
	});
});
