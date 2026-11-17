import { hasOmittedBody } from "@superset/chat/core";
import type { Item } from "@superset/chat/protocol";

export function omittedDescendantIds(
	parentId: string,
	childrenByParent: ReadonlyMap<string, readonly Item[]>,
): string[] {
	const ids: string[] = [];
	const queue = [...(childrenByParent.get(parentId) ?? [])];
	for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
		if (hasOmittedBody(item)) ids.push(item.id);
		const children = childrenByParent.get(item.id);
		if (children) queue.push(...children);
	}
	return ids;
}
