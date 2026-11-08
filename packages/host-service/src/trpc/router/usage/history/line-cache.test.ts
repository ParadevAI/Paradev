import { afterAll, describe, expect, test } from "bun:test";
import {
	appendFileSync,
	mkdtempSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LineFileCache, type LineParser } from "./line-cache";
import { MemoryStateStore } from "./usage-store";

const root = mkdtempSync(join(tmpdir(), "usage-line-cache-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Parser whose state is the list of lines it has seen. */
function recorder() {
	const fed: string[] = [];
	let created = 0;
	const create = (state: string[] = []): LineParser<string[], string[]> => {
		if (!Array.isArray(state)) throw new Error("unusable saved state");
		created++;
		return {
			state,
			onLine: (line) => {
				fed.push(line);
				state.push(line);
			},
			result: () => [...state],
		};
	};
	return { fed, create, created: () => created };
}

/** A store reloaded from disk: same keys, values rebuilt from JSON. */
function reloaded(store: MemoryStateStore, keys: string[]): MemoryStateStore {
	const next = new MemoryStateStore();
	for (const key of keys) {
		next.set(key, JSON.parse(JSON.stringify(store.get(key))));
	}
	return next;
}

const fileKey = (path: string) => `file\u0000k\u0000${path}`;

describe("LineFileCache", () => {
	test("reads only the lines appended since the last parse", async () => {
		const path = join(root, "append.jsonl");
		writeFileSync(path, "a\nb\n");
		const cache = new LineFileCache();
		const { fed, create } = recorder();

		expect(await cache.parse("k", path, create)).toEqual(["a", "b"]);
		expect(await cache.parse("k", path, create)).toEqual(["a", "b"]);
		appendFileSync(path, "c\n");
		expect(await cache.parse("k", path, create)).toEqual(["a", "b", "c"]);
		expect(fed).toEqual(["a", "b", "c"]);
	});

	test("after a restart, resumes from the saved state and offset", async () => {
		const path = join(root, "restart.jsonl");
		writeFileSync(path, "a\nb\n");
		const store = new MemoryStateStore();
		await new LineFileCache(store).parse("k", path, recorder().create);

		appendFileSync(path, "c\n");
		const restarted = new LineFileCache(reloaded(store, [fileKey(path)]));
		const { fed, create } = recorder();
		expect(await restarted.parse("k", path, create)).toEqual(["a", "b", "c"]);
		expect(fed).toEqual(["c"]);
	});

	test("parses again from the start when the file shrinks or is replaced", async () => {
		const path = join(root, "rewrite.jsonl");
		writeFileSync(path, "a\nb\n");
		const cache = new LineFileCache();
		const { create, created } = recorder();
		await cache.parse("k", path, create);

		writeFileSync(path, "x\n");
		expect(await cache.parse("k", path, create)).toEqual(["x"]);
		writeFileSync(`${path}.next`, "y\nz\n");
		renameSync(`${path}.next`, path);
		expect(await cache.parse("k", path, create)).toEqual(["y", "z"]);
		expect(created()).toBe(3);
	});

	test("never hands an unterminated last line to the parser twice", async () => {
		const path = join(root, "partial.jsonl");
		writeFileSync(path, "a\n{par");
		const cache = new LineFileCache();
		const { create } = recorder();
		expect(await cache.parse("k", path, create)).toEqual(["a", "{par"]);

		appendFileSync(path, "tial}\n");
		expect(await cache.parse("k", path, create)).toEqual(["a", "{partial}"]);
	});

	test("forgets files a scan no longer visits", async () => {
		const path = join(root, "evict.jsonl");
		writeFileSync(path, "a\n");
		const store = new MemoryStateStore();
		const cache = new LineFileCache(store);
		store.beginScan();
		await cache.parse("k", path, recorder().create);
		store.endScan();
		expect(store.get(fileKey(path))).toBeDefined();
		store.beginScan();
		store.endScan();
		expect(store.get(fileKey(path))).toBeUndefined();
	});

	test("parses again when a file is rewritten in place past the saved offset", async () => {
		const path = join(root, "rewrite-in-place.jsonl");
		writeFileSync(path, "a\nb\n");
		const cache = new LineFileCache();
		await cache.parse("k", path, recorder().create);

		writeFileSync(path, "x\ny\nz\n");
		const { fed, create } = recorder();
		expect(await cache.parse("k", path, create)).toEqual(["x", "y", "z"]);
		expect(fed).toEqual(["x", "y", "z"]);
	});

	test("parses again when the saved state cannot be used", async () => {
		const path = join(root, "bad-state.jsonl");
		writeFileSync(path, "a\n");
		const store = new MemoryStateStore();
		const cache = new LineFileCache(store);
		await cache.parse("k", path, recorder().create);
		const cursor = store.get(fileKey(path)) as { state: unknown };
		store.set(fileKey(path), { ...cursor, state: "not an array" });

		expect(await cache.parse("k", path, recorder().create)).toEqual(["a"]);
	});

	test("does not read an unchanged file with an unterminated last line again", async () => {
		const path = join(root, "partial-unchanged.jsonl");
		writeFileSync(path, "a\n{par");
		const cache = new LineFileCache();
		const { fed, create } = recorder();
		await cache.parse("k", path, create);
		expect(await cache.parse("k", path, create)).toEqual(["a", "{par"]);
		expect(fed).toEqual(["a", "{par"]);
	});
});
