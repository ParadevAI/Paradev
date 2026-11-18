import { useMemo } from "react";
import type { SessionSnapshot, TurnGroup } from "../../core";
import { type DeriveTimelineOptions, deriveTimeline } from "../../core";

export function useTimeline(
	snapshot: SessionSnapshot,
	options?: Pick<DeriveTimelineOptions, "nestChildItems">,
): TurnGroup[] {
	const { items, turns } = snapshot;
	const harness = snapshot.session?.harness;
	const nestChildItems = options?.nestChildItems ?? false;
	return useMemo(
		() => deriveTimeline({ items, turns }, { nestChildItems, harness }),
		[items, turns, nestChildItems, harness],
	);
}
