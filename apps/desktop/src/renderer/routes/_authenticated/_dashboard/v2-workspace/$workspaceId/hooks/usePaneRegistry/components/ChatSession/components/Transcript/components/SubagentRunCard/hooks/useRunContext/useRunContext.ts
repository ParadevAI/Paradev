import { displayText } from "@superset/chat/core";
import { useMemo } from "react";
import { useNestedItems } from "../../../../providers/NestedItemsProvider";
import type { RunContext } from "../../../../utils/subagentRuns";

export function useRunContext(): RunContext {
	const { snapshot, childrenByParent, liveTasks } = useNestedItems();
	return useMemo(
		() => ({
			childrenByParent,
			liveTaskIds: liveTasks ?? null,
			turnRunning: (itemId: string) => {
				const turnId = snapshot.items.get(itemId)?.turnId;
				return turnId
					? snapshot.turns.get(turnId)?.status === "running"
					: false;
			},
			textOf: (item) => displayText(snapshot, item.id),
		}),
		[snapshot, childrenByParent, liveTasks],
	);
}
