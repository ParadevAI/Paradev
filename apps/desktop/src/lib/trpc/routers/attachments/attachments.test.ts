import { afterEach, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";
import { copyLocalFileExclusive } from "./attachments";

const roots: string[] = [];

function setup() {
	const root = mkdtempSync(join(tmpdir(), "attachments-"));
	roots.push(root);
	const source = join(root, "build.dmg");
	writeFileSync(source, "new");
	const directory = join(root, "worktree", WORKSPACE_ATTACHMENTS_DIR);
	mkdirSync(directory, { recursive: true });
	return { root, source, directory };
}

afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

describe("copyLocalFileExclusive", () => {
	it("copies into the attachments directory and never overwrites", async () => {
		const { source, directory } = setup();
		const destinationPath = join(directory, "build.dmg");

		expect(
			await copyLocalFileExclusive({ sourcePath: source, destinationPath }),
		).toEqual({ ok: true });
		writeFileSync(source, "changed");
		expect(
			await copyLocalFileExclusive({ sourcePath: source, destinationPath }),
		).toEqual({
			ok: false,
			reason: "exists",
		});
		expect(readFileSync(destinationPath, "utf8")).toBe("new");
	});

	it("refuses a destination outside the attachments directory", async () => {
		const { root, source } = setup();

		await expect(
			copyLocalFileExclusive({
				sourcePath: source,
				destinationPath: join(root, "out.dmg"),
			}),
		).rejects.toThrow(WORKSPACE_ATTACHMENTS_DIR);
	});

	it("refuses a directory as the source", async () => {
		const { root, directory } = setup();

		await expect(
			copyLocalFileExclusive({
				sourcePath: root,
				destinationPath: join(directory, "x"),
			}),
		).rejects.toThrow("not a file");
	});
});
