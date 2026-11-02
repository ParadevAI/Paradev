import {
	adoptInstalledPlugins,
	installedPluginsFilePath,
} from "@superset/agent-setup";

interface SqliteReader {
	prepare(sql: string): { get(): unknown };
}

interface LegacyRecord {
	name: string;
	version: string;
	installedAt: string;
	enabled?: boolean;
}

function isLegacyRecord(value: unknown): value is LegacyRecord {
	const record = value as Partial<LegacyRecord> | null;
	return (
		typeof record?.name === "string" &&
		typeof record.version === "string" &&
		typeof record.installedAt === "string"
	);
}

/**
 * Until installed_plugins.json was the only record, the desktop also kept its
 * installs in settings.installed_plugins, and a failed CLI step left some
 * only there. Runs before the migration that drops the column, so an upgrade
 * loses none. Returns the names it moved.
 */
export function adoptLegacyInstalledPlugins(
	sqlite: SqliteReader,
	file: string = installedPluginsFilePath(),
): string[] {
	const column = sqlite
		.prepare(
			"SELECT 1 FROM pragma_table_info('settings') WHERE name = 'installed_plugins'",
		)
		.get();
	if (!column) return [];
	const row = sqlite
		.prepare("SELECT installed_plugins AS value FROM settings WHERE id = 1")
		.get() as { value: string | null } | undefined;
	if (!row?.value) return [];
	let records: unknown;
	try {
		records = JSON.parse(row.value);
	} catch {
		return [];
	}
	if (!Array.isArray(records)) return [];
	return adoptInstalledPlugins(records.filter(isLegacyRecord), file);
}
