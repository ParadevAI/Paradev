import { afterEach, describe, expect, it, spyOn } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	applySearchPatchEvents,
	collectSearchIndexEntries,
	getSearchIndex,
	invalidateAllSearchIndexes,
	MAX_DIRECTORY_PATCH_EVENTS,
	patchSearchIndexesForRoot,
	SearchIndexBuildAborted,
} from "./search";

const roots: string[] = [];

async function makeRoot(): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "search-bounds-"));
	roots.push(root);
	return root;
}

async function makeRepoRoot(): Promise<string> {
	const root = await makeRoot();
	await fs.mkdir(path.join(root, ".git"), { recursive: true });
	return root;
}

async function writeAtDepth(root: string, depth: number, name: string) {
	const dir = path.join(
		root,
		...Array.from({ length: depth }, (_, i) => `d${i}`),
	);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(path.join(dir, name), "x");
}

afterEach(async () => {
	invalidateAllSearchIndexes();
	await Promise.all(
		roots
			.splice(0)
			.map((root) => fs.rm(root, { recursive: true, force: true })),
	);
});

describe("index walk depth", () => {
	it("indexes arbitrarily deep files inside a git repository", async () => {
		const root = await makeRepoRoot();
		await writeAtDepth(root, 12, "deep.ts");

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});

		expect(index.map((entry) => entry.name)).toContain("deep.ts");
	});

	it("stops descending past the bound outside a git repository", async () => {
		const root = await makeRoot();
		await writeAtDepth(root, 2, "shallow.ts");
		await writeAtDepth(root, 12, "deep.ts");

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		const names = index.map((entry) => entry.name);

		expect(names).toContain("shallow.ts");
		expect(names).not.toContain("deep.ts");
	});
});

describe("directory patch events", () => {
	it("removes an indexed subtree when its directory is deleted", async () => {
		const root = await makeRepoRoot();
		await fs.mkdir(path.join(root, "keep"), { recursive: true });
		await fs.mkdir(path.join(root, "drop", "nested"), { recursive: true });
		await fs.writeFile(path.join(root, "keep", "a.ts"), "x");
		await fs.writeFile(path.join(root, "drop", "b.ts"), "x");
		await fs.writeFile(path.join(root, "drop", "nested", "c.ts"), "x");

		await getSearchIndex({ rootPath: root, includeHidden: false });
		await fs.rm(path.join(root, "drop"), { recursive: true, force: true });

		patchSearchIndexesForRoot(root, [
			{
				kind: "delete",
				absolutePath: path.join(root, "drop"),
				isDirectory: true,
			},
		]);

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(index.map((entry) => entry.name).sort()).toEqual(["a.ts"]);
	});

	it("re-keys an indexed subtree when its directory is renamed", async () => {
		const root = await makeRepoRoot();
		await fs.mkdir(path.join(root, "before", "nested"), { recursive: true });
		await fs.writeFile(path.join(root, "before", "a.ts"), "x");
		await fs.writeFile(path.join(root, "before", "nested", "b.ts"), "x");

		await getSearchIndex({ rootPath: root, includeHidden: false });
		await fs.rename(path.join(root, "before"), path.join(root, "after"));

		patchSearchIndexesForRoot(root, [
			{
				kind: "rename",
				oldAbsolutePath: path.join(root, "before"),
				absolutePath: path.join(root, "after"),
				isDirectory: true,
			},
		]);

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(index.map((entry) => entry.relativePath).sort()).toEqual([
			"after/a.ts",
			"after/nested/b.ts",
		]);
	});

	it("rebuilds when a directory is created, since its contents are unknown", async () => {
		const root = await makeRepoRoot();
		await fs.writeFile(path.join(root, "a.ts"), "x");
		await getSearchIndex({ rootPath: root, includeHidden: false });

		await fs.mkdir(path.join(root, "added"), { recursive: true });
		await fs.writeFile(path.join(root, "added", "b.ts"), "x");

		patchSearchIndexesForRoot(root, [
			{
				kind: "create",
				absolutePath: path.join(root, "added"),
				isDirectory: true,
			},
		]);

		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		expect(index.map((entry) => entry.name).sort()).toEqual(["a.ts", "b.ts"]);
	});

	it("patches up to the directory event limit and rebuilds past it", async () => {
		const root = await makeRepoRoot();
		await fs.writeFile(path.join(root, "a.ts"), "x");
		await getSearchIndex({ rootPath: root, includeHidden: false });
		await fs.writeFile(path.join(root, "late.ts"), "x");
		const deleteDirectories = (count: number) =>
			Array.from({ length: count }, (_, i) => ({
				kind: "delete" as const,
				absolutePath: path.join(root, `gone${i}`),
				isDirectory: true,
			}));
		const names = async () =>
			(await getSearchIndex({ rootPath: root, includeHidden: false }))
				.map((entry) => entry.name)
				.sort();

		patchSearchIndexesForRoot(
			root,
			deleteDirectories(MAX_DIRECTORY_PATCH_EVENTS),
		);
		expect(await names()).toEqual(["a.ts"]);

		patchSearchIndexesForRoot(
			root,
			deleteDirectories(MAX_DIRECTORY_PATCH_EVENTS + 1),
		);
		expect(await names()).toEqual(["a.ts", "late.ts"]);
	});

	for (const source of [".hidden", "build"]) {
		it(`rebuilds when ${source} is renamed into a searchable directory`, async () => {
			const root = await makeRepoRoot();
			await fs.mkdir(path.join(root, source));
			await fs.writeFile(path.join(root, source, "found.ts"), "x");
			const before = await getSearchIndex({
				rootPath: root,
				includeHidden: false,
			});
			expect(before).toHaveLength(0);

			await fs.rename(path.join(root, source), path.join(root, "visible"));
			patchSearchIndexesForRoot(root, [
				{
					kind: "rename",
					oldAbsolutePath: path.join(root, source),
					absolutePath: path.join(root, "visible"),
					isDirectory: true,
				},
			]);

			const after = await getSearchIndex({
				rootPath: root,
				includeHidden: false,
			});
			expect(after.map((entry) => entry.relativePath)).toEqual([
				"visible/found.ts",
			]);
		});
	}
});

describe("build cancellation", () => {
	async function makeBigRepo(count: number): Promise<string> {
		const root = await makeRoot();
		await fs.mkdir(path.join(root, ".git"), { recursive: true });
		const perDir = 200;
		for (let d = 0; d * perDir < count; d++) {
			const dir = path.join(root, `d${d}`);
			await fs.mkdir(dir, { recursive: true });
			await Promise.all(
				Array.from({ length: perDir }, (_, i) =>
					fs.writeFile(path.join(dir, `f${i}.ts`), "x"),
				),
			);
		}
		return root;
	}

	it("concurrent callers share one restarted build after an abort", async () => {
		const root = await makeRepoRoot();
		await fs.writeFile(path.join(root, "a.ts"), "x");
		const stat = spyOn(fs, "stat");
		const builds = () =>
			stat.mock.calls.filter((call) => String(call[0]).endsWith(".git")).length;
		try {
			const callers = [0, 1, 2].map(() =>
				getSearchIndex({ rootPath: root, includeHidden: false }),
			);
			expect(builds()).toBe(1);
			patchSearchIndexesForRoot(root, [
				{
					kind: "create",
					absolutePath: path.join(root, "b.ts"),
					isDirectory: false,
				},
			]);

			for (const items of await Promise.all(callers)) {
				expect(items.map((entry) => entry.name)).toEqual(["a.ts"]);
			}
			expect(builds()).toBe(2);
		} finally {
			stat.mockRestore();
		}
	});

	it("stops collecting with SearchIndexBuildAborted once the signal aborts", async () => {
		const abort = new AbortController();
		let yielded = 0;
		async function* walk() {
			for (const entry of ["a.ts", "b.ts", "c.ts", "d.ts"]) {
				yielded++;
				if (yielded === 3) abort.abort();
				yield entry;
			}
		}

		await expect(
			collectSearchIndexEntries(walk(), "/root", {
				maxEntries: 10,
				signal: abort.signal,
			}),
		).rejects.toBeInstanceOf(SearchIndexBuildAborted);
		expect(yielded).toBe(3);
	});

	it("returns an index to the caller when its build is aborted mid-walk", async () => {
		const root = await makeBigRepo(6000);

		const inFlight = getSearchIndex({ rootPath: root, includeHidden: false });
		await new Promise((resolve) => setTimeout(resolve, 1));
		invalidateAllSearchIndexes();

		const index = await inFlight;
		expect(index.length).toBe(6000);
	});

	it("survives repeated invalidation during a build", async () => {
		const root = await makeBigRepo(6000);

		const inFlight = getSearchIndex({ rootPath: root, includeHidden: false });
		await new Promise((resolve) => setTimeout(resolve, 1));
		invalidateAllSearchIndexes();
		await new Promise((resolve) => setTimeout(resolve, 1));
		invalidateAllSearchIndexes();

		const index = await inFlight;
		expect(index.length).toBe(6000);
	});
});

describe("index entry cap", () => {
	async function* walk(paths: string[]) {
		for (const p of paths) yield p;
	}

	it("stops collecting at the cap and tears the walk down", async () => {
		let stopped = 0;
		const result = await collectSearchIndexEntries(
			walk(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"]),
			"/root",
			{ maxEntries: 3, stop: () => stopped++ },
		);

		expect(result.truncated).toBe(true);
		expect(stopped).toBe(1);
		expect(result.items.map((entry) => entry.name)).toEqual([
			"a.ts",
			"b.ts",
			"c.ts",
		]);
	});

	it("a walk that fits under the cap is not truncated", async () => {
		let stopped = 0;
		const result = await collectSearchIndexEntries(
			walk(["a.ts", "b.ts", "c.ts"]),
			"/root",
			{ maxEntries: 3, stop: () => stopped++ },
		);

		expect(result.truncated).toBe(false);
		expect(stopped).toBe(0);
		expect(result.items).toHaveLength(3);
	});

	it("patch events cannot grow a capped index past the limit", async () => {
		const root = await makeRepoRoot();
		for (const name of ["a.ts", "b.ts", "c.ts"]) {
			await fs.writeFile(path.join(root, name), "x");
		}
		const index = await getSearchIndex({
			rootPath: root,
			includeHidden: false,
		});
		const itemsByPath = new Map(index.map((e) => [e.absolutePath, e]));
		const context = {
			itemsByPath,
			rootPath: root,
			includeHidden: false,
			maxEntries: 3,
		};
		const at = (name: string) => path.join(root, name);
		const names = () =>
			[...itemsByPath.values()].map((e) => e.relativePath).sort();

		applySearchPatchEvents(context, [
			{ kind: "create", absolutePath: at("new.ts"), isDirectory: false },
		]);
		expect(names()).toEqual(["a.ts", "b.ts", "c.ts"]);

		applySearchPatchEvents(context, [
			{ kind: "update", absolutePath: at("a.ts"), isDirectory: false },
			{
				kind: "rename",
				absolutePath: at("renamed.ts"),
				oldAbsolutePath: at("b.ts"),
				isDirectory: false,
			},
		]);
		expect(names()).toEqual(["a.ts", "c.ts", "renamed.ts"]);

		applySearchPatchEvents(context, [
			{ kind: "delete", absolutePath: at("c.ts"), isDirectory: false },
			{ kind: "create", absolutePath: at("new.ts"), isDirectory: false },
		]);
		expect(names()).toEqual(["a.ts", "new.ts", "renamed.ts"]);
	});
	it("a directory rename at the cap keeps every moved entry", () => {
		const root = "/root";
		const itemsByPath = new Map(
			["before/a.ts", "before/n/b.ts", "before/n/c.ts", "keep.ts"].map(
				(rel) => {
					const abs = path.join(root, rel);
					return [
						abs,
						{
							absolutePath: abs,
							relativePath: rel,
							name: path.basename(rel),
							description: path.dirname(rel),
						},
					];
				},
			),
		);

		applySearchPatchEvents(
			{ itemsByPath, rootPath: root, includeHidden: false, maxEntries: 4 },
			[
				{
					kind: "rename",
					oldAbsolutePath: path.join(root, "before"),
					absolutePath: path.join(root, "after"),
					isDirectory: true,
				},
			],
		);

		expect([...itemsByPath.values()].map((e) => e.relativePath).sort()).toEqual(
			["after/a.ts", "after/n/b.ts", "after/n/c.ts", "keep.ts"],
		);
	});
});

describe("build restart bound", () => {
	it("terminates when a joined build is repeatedly superseded", async () => {
		const root = await makeRoot();
		await fs.mkdir(path.join(root, ".git"), { recursive: true });
		for (let d = 0; d < 30; d++) {
			const dir = path.join(root, `d${d}`);
			await fs.mkdir(dir, { recursive: true });
			await Promise.all(
				Array.from({ length: 200 }, (_, i) =>
					fs.writeFile(path.join(dir, `f${i}.ts`), "x"),
				),
			);
		}

		const owner = getSearchIndex({ rootPath: root, includeHidden: false });
		const joiner = getSearchIndex({ rootPath: root, includeHidden: false });

		const storm = setInterval(() => invalidateAllSearchIndexes(), 1);
		try {
			const settled = await Promise.race([
				Promise.all([owner, joiner]).then(() => "settled" as const),
				new Promise<"hung">((resolve) =>
					setTimeout(() => resolve("hung"), 15_000),
				),
			]);
			expect(settled).toBe("settled");
		} finally {
			clearInterval(storm);
		}
	}, 30_000);
});
