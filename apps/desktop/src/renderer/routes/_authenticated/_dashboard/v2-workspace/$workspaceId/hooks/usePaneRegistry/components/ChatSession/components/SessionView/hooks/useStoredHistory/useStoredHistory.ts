import { emptySnapshot, type SessionSnapshot } from "@superset/chat/core";
import { useMemo } from "react";
import { withStoredHistory } from "../../utils/withStoredHistory";

/** A streamed delta changes only `liveStreams`; merging again on it would make
 * new maps and derive the whole timeline on every frame. */
export function useStoredHistory(
	stored: SessionSnapshot | null | undefined,
	live: SessionSnapshot,
): SessionSnapshot {
	const { items, turns, cursor, session } = live;
	const merged = useMemo(
		() =>
			stored
				? withStoredHistory(stored, {
						...emptySnapshot(),
						items,
						turns,
						cursor,
						session,
					})
				: null,
		[stored, items, turns, cursor, session],
	);
	return useMemo(() => {
		if (!merged || merged.items === items) return live;
		return {
			...merged,
			liveStreams: live.liveStreams,
			pendingReset: live.pendingReset,
		};
	}, [merged, items, live]);
}
