import AsyncStorage from "@react-native-async-storage/async-storage";
import { Directory, File, Paths } from "expo-file-system";
import {
	type CacheFiles,
	createFileQueryCacheStorage,
} from "./createFileQueryCacheStorage";
import type { QueryCacheStorage } from "./queryCacheStorage.types";

// AsyncStorage on Android is SQLite: a row over the ~2 MB CursorWindow cannot
// be read back, and the whole database stops at 6 MB.
const directory = new Directory(Paths.cache, "query-cache");

const files: CacheFiles = {
	read: async (name) => {
		const file = new File(directory, name);
		return file.exists ? file.text() : null;
	},
	write: async (name, value) => {
		directory.create({ intermediates: true, idempotent: true });
		const partial = new File(directory, `${name}.part`);
		await partial.write(value);
		await partial.move(new File(directory, name), { overwrite: true });
	},
	remove: async (name) => {
		const file = new File(directory, name);
		if (file.exists) file.delete();
	},
};

export const queryCacheStorage: QueryCacheStorage = createFileQueryCacheStorage(
	{ files, legacy: AsyncStorage },
);
