import { describe, expect, test } from "bun:test";
import {
	type CacheFiles,
	createFileQueryCacheStorage,
} from "./createFileQueryCacheStorage";

function memoryFiles(): CacheFiles & { names: () => string[] } {
	const store = new Map<string, string>();
	return {
		read: async (name) => store.get(name) ?? null,
		write: async (name, value) => {
			store.set(name, value);
		},
		remove: async (name) => {
			store.delete(name);
		},
		names: () => [...store.keys()],
	};
}

function legacyRow() {
	const removed: string[] = [];
	return {
		removed,
		getItem: async (): Promise<string | null> => {
			throw new Error("Row too big to fit into CursorWindow");
		},
		removeItem: async (key: string) => {
			removed.push(key);
		},
	};
}

describe("createFileQueryCacheStorage", () => {
	test("round-trips a cache larger than one SQLite CursorWindow", async () => {
		const files = memoryFiles();
		const storage = createFileQueryCacheStorage({
			files,
			legacy: legacyRow(),
		});
		const big = "x".repeat(3 * 1024 * 1024);

		await storage.setItem("superset-rq-cache", big);

		expect(await storage.getItem("superset-rq-cache")).toBe(big);
		expect(files.names()).toEqual(["superset-rq-cache.json"]);
	});

	test("removes the old AsyncStorage row once without reading it", async () => {
		const legacy = legacyRow();
		const storage = createFileQueryCacheStorage({
			files: memoryFiles(),
			legacy,
		});

		expect(await storage.getItem("superset-rq-cache")).toBeNull();
		await storage.setItem("superset-rq-cache", "{}");

		expect(legacy.removed).toEqual(["superset-rq-cache"]);
	});

	test("a failed legacy removal does not block the cache", async () => {
		const storage = createFileQueryCacheStorage({
			files: memoryFiles(),
			legacy: {
				removeItem: async () => {
					throw new Error("database is locked");
				},
			},
		});

		await storage.setItem("k", "v");
		expect(await storage.getItem("k")).toBe("v");
	});

	test("removeItem deletes the file", async () => {
		const files = memoryFiles();
		const storage = createFileQueryCacheStorage({
			files,
			legacy: legacyRow(),
		});

		await storage.setItem("k", "v");
		await storage.removeItem("k");

		expect(await storage.getItem("k")).toBeNull();
	});
});
