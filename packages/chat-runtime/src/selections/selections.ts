import {
	type ChatSelections,
	isSelectionCategory,
	isStartingMode,
	type SelectionCategory,
	selectionKey,
} from "@superset/chat/core";
import { and, eq, notInArray } from "drizzle-orm";
import type { ChatDb } from "../db";
import { chatDefaultSelections, chatSelections } from "../db";

export type DefaultSelections = Pick<ChatSelections, "modelId" | "effortId">;

const DEFAULT_CATEGORIES = {
	model: "modelId",
	thought_level: "effortId",
} as const satisfies Partial<
	Record<SelectionCategory, keyof DefaultSelections>
>;

type SelectionTable = typeof chatSelections | typeof chatDefaultSelections;

/**
 * What the user last picked per harness, and the defaults they chose over it.
 * ACP keeps a selection for one session only, so this is what a new chat starts from.
 */
export class SelectionMemory {
	constructor(
		private readonly db: ChatDb,
		private readonly now: () => number = Date.now,
	) {}

	get(harness: string): ChatSelections {
		return this.read(chatSelections, harness);
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

	defaults(harness: string): DefaultSelections {
		const { modelId, effortId } = this.read(chatDefaultSelections, harness);
		return {
			...(modelId ? { modelId } : {}),
			...(effortId ? { effortId } : {}),
		};
	}

	/** Replaces the harness's defaults; a field left out goes back to the last pick. */
	setDefaults(harness: string, defaults: DefaultSelections): void {
		const updatedAt = this.now();
		const rows = Object.entries(DEFAULT_CATEGORIES).flatMap(
			([category, key]) => {
				const value = defaults[key];
				return value ? [{ harness, category, value, updatedAt }] : [];
			},
		);
		this.db.transaction((tx) => {
			tx.delete(chatDefaultSelections)
				.where(
					and(
						eq(chatDefaultSelections.harness, harness),
						notInArray(
							chatDefaultSelections.category,
							rows.map((row) => row.category),
						),
					),
				)
				.run();
			for (const row of rows) {
				tx.insert(chatDefaultSelections)
					.values(row)
					.onConflictDoUpdate({
						target: [
							chatDefaultSelections.harness,
							chatDefaultSelections.category,
						],
						set: { value: row.value, updatedAt },
					})
					.run();
			}
		});
	}

	private read(table: SelectionTable, harness: string): ChatSelections {
		let rows: (typeof table.$inferSelect)[];
		try {
			rows = this.db
				.select()
				.from(table)
				.where(eq(table.harness, harness))
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
}
