import type { QueryCacheStorage } from "./queryCacheStorage.types";

export interface CacheFiles {
	read: (name: string) => Promise<string | null>;
	write: (name: string, value: string) => Promise<void>;
	remove: (name: string) => Promise<void>;
}

export function createFileQueryCacheStorage({
	files,
	legacy,
}: {
	files: CacheFiles;
	legacy: Pick<QueryCacheStorage, "removeItem">;
}): QueryCacheStorage {
	const legacyDropped = new Set<string>();
	// Earlier builds kept the cache in `legacy`, where a big one can no longer
	// be read. Remove it without reading it.
	const dropLegacy = async (key: string) => {
		if (legacyDropped.has(key)) return;
		legacyDropped.add(key);
		await legacy.removeItem(key).catch(() => {});
	};
	const fileName = (key: string) => `${encodeURIComponent(key)}.json`;

	return {
		getItem: async (key) => {
			await dropLegacy(key);
			return files.read(fileName(key));
		},
		setItem: async (key, value) => {
			await dropLegacy(key);
			await files.write(fileName(key), value);
		},
		removeItem: async (key) => {
			await dropLegacy(key);
			await files.remove(fileName(key));
		},
	};
}
