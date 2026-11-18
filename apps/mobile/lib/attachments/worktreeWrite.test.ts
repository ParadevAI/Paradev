import { describe, expect, test } from "bun:test";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import { writeAttachmentsToWorktree } from "./worktreeWrite";

const DIR = `/repo/${WORKSPACE_ATTACHMENTS_DIR}`;

describe("writeAttachmentsToWorktree", () => {
	test("writes the bytes into the worktree create-only and names around what is there", async () => {
		const existing = new Set([`${DIR}/shot.png`]);
		const written: string[] = [];
		const paths = await writeAttachmentsToWorktree(
			[
				{
					name: "shot.png",
					mimeType: "image/png",
					size: 3,
					readBase64: async () => "AQID",
				},
			],
			{
				worktreePath: async () => "/repo",
				createDirectory: async () => {},
				writeFile: async ({ absolutePath }) => {
					if (existing.has(absolutePath))
						return { ok: false, reason: "exists" };
					existing.add(absolutePath);
					written.push(absolutePath);
					return { ok: true };
				},
			},
		);
		expect(written).toEqual([`${DIR}/.gitignore`, `${DIR}/shot_1.png`]);
		expect(paths).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/shot_1.png`]);
	});
});
