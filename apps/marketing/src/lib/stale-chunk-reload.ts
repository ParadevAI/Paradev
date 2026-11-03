const RELOADED_AT_KEY = "stale-chunk-reloaded-at";
const RELOAD_COOLDOWN_MS = 60_000;

export function isChunkLoadError(reason: unknown): boolean {
	return reason instanceof Error && reason.name === "ChunkLoadError";
}

/**
 * A page from an older build asks for chunks the current deploy no longer
 * serves; a reload fetches the current HTML. The cooldown stops a reload loop
 * when a chunk is missing from the current build too.
 */
export function reloadForStaleChunk(
	storage: Pick<Storage, "getItem" | "setItem">,
	reload: () => void,
	now = Date.now(),
): boolean {
	try {
		const reloadedAt = Number(storage.getItem(RELOADED_AT_KEY));
		if (now - reloadedAt < RELOAD_COOLDOWN_MS) return false;
		storage.setItem(RELOADED_AT_KEY, String(now));
	} catch {
		return false;
	}
	reload();
	return true;
}
