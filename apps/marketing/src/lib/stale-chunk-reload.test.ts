import { describe, expect, test } from "bun:test";
import { isChunkLoadError, reloadForStaleChunk } from "./stale-chunk-reload";

function fakeStorage() {
	const items = new Map<string, string>();
	return {
		getItem: (key: string) => items.get(key) ?? null,
		setItem: (key: string, value: string) => {
			items.set(key, value);
		},
	};
}

function chunkLoadError() {
	const error = new Error("Failed to load chunk /_next/static/chunks/a.js");
	error.name = "ChunkLoadError";
	return error;
}

describe("isChunkLoadError", () => {
	test("matches only the chunk loader's error", () => {
		expect(isChunkLoadError(chunkLoadError())).toBe(true);
		expect(isChunkLoadError(new Error("Failed to fetch"))).toBe(false);
		expect(isChunkLoadError("ChunkLoadError")).toBe(false);
	});
});

describe("reloadForStaleChunk", () => {
	test("reloads once, then not again until the cooldown ends", () => {
		const storage = fakeStorage();
		let reloads = 0;
		const reload = () => {
			reloads++;
		};

		expect(reloadForStaleChunk(storage, reload, 1_000_000)).toBe(true);
		expect(reloadForStaleChunk(storage, reload, 1_030_000)).toBe(false);
		expect(reloadForStaleChunk(storage, reload, 1_060_000)).toBe(true);
		expect(reloads).toBe(2);
	});

	test("does not reload when storage is unavailable, so it cannot loop", () => {
		let reloads = 0;
		const blocked = {
			getItem: () => {
				throw new Error("SecurityError");
			},
			setItem: () => {},
		};

		expect(
			reloadForStaleChunk(blocked, () => {
				reloads++;
			}),
		).toBe(false);
		expect(reloads).toBe(0);
	});
});
