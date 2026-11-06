import { useMemo } from "react";
import type { SessionSnapshot, TurnGroup } from "../../core";
import { type DeriveTimelineOptions, deriveTimeline } from "../../core";

export function useTimeline(
	snapshot: SessionSnapshot,
	options?: DeriveTimelineOptions,
): TurnGroup[] {
	const { items, turns } = snapshot;
	const nestChildItems = options?.nestChildItems ?? false;
	return useMemo(
		() => deriveTimeline({ items, turns }, { nestChildItems }),
		[items, turns, nestChildItems],
	);
}
