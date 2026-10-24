import { describe, expect, test } from "bun:test";
import { writeAttachmentsToWorktree } from "./worktreeWrite";

describe("writeAttachmentsToWorktree", () => {
	test("writes the bytes into the worktree create-only and names around what is there", async () => {
		const existing = new Set(["/repo/.superset/attachments/shot.png"]);
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
		expect(written).toEqual([
			"/repo/.superset/attachments/.gitignore",
			"/repo/.superset/attachments/shot_1.png",
		]);
		expect(paths).toEqual([".superset/attachments/shot_1.png"]);
	});
});
