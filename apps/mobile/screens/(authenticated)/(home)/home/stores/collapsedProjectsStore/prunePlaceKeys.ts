/** A place's own collapse key, `placeId:__place`, beside its projects'. */
export const PLACE_COLLAPSE_KEY = "__place";

const SUFFIX = `:${PLACE_COLLAPSE_KEY}`;

/** Drops collapsed places that are not in `placeIds`; same object when none. */
export function prunePlaceKeys(
	collapsed: Record<string, true>,
	placeIds: readonly string[],
): Record<string, true> {
	const known = new Set(placeIds);
	const stale = Object.keys(collapsed).filter(
		(key) => key.endsWith(SUFFIX) && !known.has(key.slice(0, -SUFFIX.length)),
	);
	if (stale.length === 0) return collapsed;
	const next = { ...collapsed };
	for (const key of stale) delete next[key];
	return next;
}
