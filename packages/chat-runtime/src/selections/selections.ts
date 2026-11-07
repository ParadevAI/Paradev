import {
	type ChatSelections,
	isSelectionCategory,
	isStartingMode,
	type SelectionCategory,
	selectionKey,
} from "@superset/chat/core";
import { eq } from "drizzle-orm";
import type { ChatDb } from "../db";
import { chatSelections } from "../db";

/**
 * What the user last picked per harness. ACP keeps a selection for one
 * session only, so this is what a new chat starts from.
 */
export class SelectionMemory {
	constructor(
		private readonly db: ChatDb,
		private readonly now: () => number = Date.now,
	) {}

	get(harness: string): ChatSelections {
		let rows: (typeof chatSelections.$inferSelect)[];
		try {
			rows = this.db
				.select()
				.from(chatSelections)
				.where(eq(chatSelections.harness, harness))
				.all();
		} catch (error) {
			console.warn(
				"[chat-runtime] could not read remembered selections",
				error,
			);
			return {};
		}
		const remembered: ChatSelections = {};
		for (const row of rows) {
			if (isSelectionCategory(row.category)) {
				remembered[selectionKey(row.category)] = row.value;
			}
		}
		return remembered;
	}

	remember(harness: string, category: SelectionCategory, value: string): void {
		if (category === "mode" && !isStartingMode(value)) return;
		const updatedAt = this.now();
		try {
			this.db
				.insert(chatSelections)
				.values({ harness, category, value, updatedAt })
				.onConflictDoUpdate({
					target: [chatSelections.harness, chatSelections.category],
					set: { value, updatedAt },
				})
				.run();
		} catch (error) {
			console.warn("[chat-runtime] could not remember a selection", error);
		}
	}
}
