import type { SessionSnapshot } from "@superset/chat/core";
import { subagentAncestors } from "@superset/chat/core";
import type { SubagentCrumb } from "../../../../../../../../stores/chatSubagentStore";

export function subagentPath(
	items: SessionSnapshot["items"],
	itemId: string,
	fallbackTitle: string,
): SubagentCrumb[] {
	return [...subagentAncestors(items, itemId)]
		.reverse()
		.map((item) => ({ id: item.id, title: item.title || fallbackTitle }));
}
