import type { StoredItem } from "@superset/chat/core";

export function hasUserMessage(items: ReadonlyMap<string, StoredItem>) {
	for (const { item } of items.values()) {
		if (item.kind === "user_message") return true;
	}
	return false;
}
