import type { settings as settingsTable } from "@superset/local-db";
import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

type SettingsDb = Pick<
	BaseSQLiteDatabase<"sync", unknown>,
	"select" | "insert"
>;

export interface ExtensionPins {
	pinnedIds(): string[];
	setPinned(extensionId: string, pinned: boolean): void;
}

/** Which browser-pane extensions sit on the toolbar, kept on the settings row. */
export function createExtensionPins(
	db: SettingsDb,
	settings: typeof settingsTable,
): ExtensionPins {
	const readRow = () =>
		db
			.select({ id: settings.id, ids: settings.browserPinnedExtensions })
			.from(settings)
			.get();

	return {
		pinnedIds: () => readRow()?.ids ?? [],
		setPinned(extensionId, pinned) {
			const row = readRow();
			const others = (row?.ids ?? []).filter((id) => id !== extensionId);
			const next = pinned ? [...others, extensionId] : others;
			// Legacy databases can hold a settings row whose id is not 1.
			db.insert(settings)
				.values({ id: row?.id ?? 1, browserPinnedExtensions: next })
				.onConflictDoUpdate({
					target: settings.id,
					set: { browserPinnedExtensions: next },
				})
				.run();
		},
	};
}
