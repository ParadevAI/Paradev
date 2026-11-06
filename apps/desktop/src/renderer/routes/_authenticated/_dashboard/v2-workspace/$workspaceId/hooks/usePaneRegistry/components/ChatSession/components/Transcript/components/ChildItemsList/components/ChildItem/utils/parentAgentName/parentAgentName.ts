import type { SessionSnapshot } from "@superset/chat/core";
import { subagentAncestors } from "@superset/chat/core";

export function parentAgentName(
	items: SessionSnapshot["items"],
	subagentId: string,
): string | null {
	const [parent] = subagentAncestors(
		items,
		items.get(subagentId)?.item.parentItemId,
	);
	return parent?.title || null;
}
