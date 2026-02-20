import type { Collection } from "@tanstack/db";
import { createMessagesCollection } from "../../../../session-db/collections/messages";
import {
	createSessionDB,
	type SessionDB,
	type SessionDBConfig,
} from "../../../../session-db/session-db";
import type { MessageRow } from "../../../../session-db/types";

interface CacheEntry {
	db: SessionDB;
	messagesCollection: Collection<MessageRow>;
	preloadPromise: Promise<void>;
	preloaded: boolean;
	cleanupTimer: ReturnType<typeof setTimeout> | null;
	keepAlive: { unsubscribe: () => void }[];
}

const cache = new Map<string, CacheEntry>();
const CLEANUP_DELAY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Reset the inactivity timer for a cache entry.
 * Each access pushes the cleanup window forward.
 */
function touchEntry(key: string, entry: CacheEntry): void {
	if (entry.cleanupTimer) {
		clearTimeout(entry.cleanupTimer);
	}
	entry.cleanupTimer = setTimeout(() => {
		for (const sub of entry.keepAlive) sub.unsubscribe();
		entry.db.close();
		cache.delete(key);
	}, CLEANUP_DELAY_MS);
}

/**
 * Get (or create) a cached SessionDB for the given session.
 *
 * No manual release is needed — the entry is automatically cleaned up
 * after 1 hour of inactivity. Every call resets the inactivity timer.
 */
export function getSessionDB(config: SessionDBConfig): {
	db: SessionDB;
	messagesCollection: Collection<MessageRow>;
	preloadPromise: Promise<void>;
	preloaded: boolean;
} {
	const key = config.sessionId;
	const existing = cache.get(key);
	if (existing) {
		touchEntry(key, existing);
		return {
			db: existing.db,
			messagesCollection: existing.messagesCollection,
			preloadPromise: existing.preloadPromise,
			preloaded: existing.preloaded,
		};
	}

	const db = createSessionDB(config);
	const messagesCollection = createMessagesCollection({
		chunksCollection: db.collections.chunks,
	});
	const keepAlive = [
		db.collections.chunks.subscribeChanges(() => {}),
		messagesCollection.subscribeChanges(() => {}),
	];

	const entry: CacheEntry = {
		db,
		messagesCollection,
		preloadPromise: undefined as unknown as Promise<void>,
		preloaded: false,
		cleanupTimer: null,
		keepAlive,
	};
	entry.preloadPromise = db.preload().then(() => {
		entry.preloaded = true;
	});
	touchEntry(key, entry);
	cache.set(key, entry);
	return {
		db,
		messagesCollection,
		preloadPromise: entry.preloadPromise,
		preloaded: entry.preloaded,
	};
}
