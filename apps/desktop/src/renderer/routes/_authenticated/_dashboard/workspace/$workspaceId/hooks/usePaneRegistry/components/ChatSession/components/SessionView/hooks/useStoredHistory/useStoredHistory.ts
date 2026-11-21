import { emptySnapshot, type SessionSnapshot } from "@superset/chat/core";
import { useMemo } from "react";
import {
	storedIsAhead,
	withStoredHistory,
} from "../../utils/withStoredHistory";

const NO_STREAMS: SessionSnapshot["liveStreams"] = new Map();

/** A streamed delta keeps the merged items' identity. */
export function useStoredHistory(
	stored: SessionSnapshot | null | undefined,
	live: SessionSnapshot,
): SessionSnapshot {
	const { items, turns, cursor, session } = live;
	const merged = useMemo(() => {
		if (!stored) return null;
		const visible = { ...emptySnapshot(), items, turns, cursor, session };
		return {
			snapshot: withStoredHistory(stored, visible),
			ahead: storedIsAhead(stored, visible),
		};
	}, [stored, items, turns, cursor, session]);
	return useMemo(() => {
		if (!merged || merged.snapshot.items === items) return live;
		return {
			...merged.snapshot,
			liveStreams: merged.ahead ? NO_STREAMS : live.liveStreams,
			pendingReset: live.pendingReset,
		};
	}, [merged, items, live]);
}
