import { afterEach, describe, expect, it } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	pickFileReference,
	resolveFileReference,
} from "./resolve-file-reference";
import { invalidateAllSearchIndexes } from "./search";

const ROOT = "/repo";

const file = (relativePath: string) => ({
	absolutePath: `${ROOT}/${relativePath}`,
	relativePath,
	name: relativePath.split("/").at(-1) ?? relativePath,
});

const FILES = [
	"package.json",
	"apps/desktop/package.json",
	"apps/desktop/src/renderer/commandPalette/CommandPaletteHost.tsx",
	"apps/desktop/src/renderer/routes/_dashboard/layout.tsx",
	"apps/desktop/src/renderer/routes/v2-workspace/layout.tsx",
	"apps/desktop/src/renderer/stores/archive/index.ts",
	"apps/desktop/src/renderer/utils/selectIds/index.ts",
	"packages/host-service/src/index.ts",
].map(file);

const pick = (reference: string, preferred: string[] = []) =>
	pickFileReference(FILES, reference, ROOT, preferred)?.relativePath ?? null;

describe("pickFileReference", () => {
	it("opens the one file a shortened path ends at", () => {
		expect(pick("commandPalette/CommandPaletteHost.tsx")).toBe(
			"apps/desktop/src/renderer/commandPalette/CommandPaletteHost.tsx",
		);
		expect(pick("CommandPaletteHost.tsx")).toBe(
			"apps/desktop/src/renderer/commandPalette/CommandPaletteHost.tsx",
		);
		expect(pick("./_dashboard/layout.tsx")).toBe(
			"apps/desktop/src/renderer/routes/_dashboard/layout.tsx",
		);
	});

	it("takes the path as written over a longer one that ends the same way", () => {
		expect(pick("package.json")).toBe("package.json");
		expect(pick("/repo/apps/desktop/package.json")).toBe(
			"apps/desktop/package.json",
		);
	});

	it("prefers the file that shares more of the written path", () => {
		expect(pick("src/utils/selectIds/index.ts")).toBe(
			"apps/desktop/src/renderer/utils/selectIds/index.ts",
		);
	});

	it("breaks a tie with a preferred path, then with the shortest path", () => {
		expect(pick("index.ts")).toBe("packages/host-service/src/index.ts");
		expect(
			pick("index.ts", [
				"apps/desktop/src/unrelated.ts",
				"apps/desktop/src/renderer/stores/archive/index.ts",
			]),
		).toBe("apps/desktop/src/renderer/stores/archive/index.ts");
	});

	it("maps a path in another checkout onto the same file here", () => {
		expect(pick("/Users/me/other/apps/desktop/package.json")).toBe(
			"apps/desktop/package.json",
		);
		expect(pick("~/other/apps/desktop/package.json")).toBe(
			"apps/desktop/package.json",
		);
	});

	it("does not open a namesake for a path somewhere else", () => {
		expect(pick("/usr/local/lib/layout.tsx")).toBeNull();
		expect(pick("/Users/me/other/src/index.ts")).toBeNull();
	});

	it("finds nothing for a name no file has", () => {
		expect(pick(".utils.ts")).toBeNull();
		expect(pick("missing/file.ts")).toBeNull();
		expect(pick("")).toBeNull();
		expect(pick("../..")).toBeNull();
	});
});

describe("resolveFileReference", () => {
	let rootPath: string | undefined;

	afterEach(async () => {
		invalidateAllSearchIndexes();
		if (rootPath) await fs.rm(rootPath, { recursive: true, force: true });
	});

	it("resolves against the files on disk", async () => {
		rootPath = await fs.mkdtemp(path.join(os.tmpdir(), "workspace-fs-ref-"));
		const target = path.join(rootPath, "src/hooks/useThing/useThing.ts");
		await fs.mkdir(path.dirname(target), { recursive: true });
		await fs.writeFile(target, "export {};\n");

		const match = await resolveFileReference({
			rootPath,
			reference: "useThing/useThing.ts",
		});
		expect(match?.relativePath).toBe("src/hooks/useThing/useThing.ts");
		expect(match?.absolutePath).toBe(target);
		expect(
			await resolveFileReference({ rootPath, reference: "nope.ts" }),
		).toBeNull();
	});
});
