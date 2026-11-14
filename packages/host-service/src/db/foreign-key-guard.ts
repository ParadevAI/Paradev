import {
	type MigrationDatabase,
	runMigrations,
} from "@superset/shared/sqlite-migrations";

/** Runs one PRAGMA and returns its rows. */
export type ReadPragma = (pragma: string) => unknown[];

type ViolationRow = { table: string; parent: string; fkid: number };
type ForeignKeyRow = { id: number; seq: number; from: string };

function quoteIdentifier(name: string): string {
	return `"${name.replaceAll('"', '""')}"`;
}

/**
 * `foreign_key_check` rows counted per `child(columns) → parent`. Rowids and
 * fk ids are not part of the key: a drizzle table rebuild reassigns both, so
 * either would misread a surviving legacy violation as a new one.
 */
function violationCountsByConstraint(
	readPragma: ReadPragma,
): Map<string, number> {
	const columnsByTable = new Map<string, Map<number, string>>();
	const columnsOf = (table: string, fkid: number): string => {
		let byFkid = columnsByTable.get(table);
		if (!byFkid) {
			const fks = readPragma(
				`foreign_key_list(${quoteIdentifier(table)})`,
			) as ForeignKeyRow[];
			const grouped = new Map<number, ForeignKeyRow[]>();
			for (const fk of fks) {
				grouped.set(fk.id, [...(grouped.get(fk.id) ?? []), fk]);
			}
			byFkid = new Map(
				[...grouped].map(([id, parts]) => [
					id,
					parts
						.sort((a, b) => a.seq - b.seq)
						.map((part) => part.from)
						.join(","),
				]),
			);
			columnsByTable.set(table, byFkid);
		}
		return byFkid.get(fkid) ?? `#${fkid}`;
	};

	const counts = new Map<string, number>();
	for (const row of readPragma("foreign_key_check") as ViolationRow[]) {
		const key = `${row.table}(${columnsOf(row.table, row.fkid)})→${row.parent}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

/**
 * Applies pending migrations and throws when they introduced a foreign key
 * violation. Violations already present before migrating are only logged:
 * long-lived databases carry legacy orphans, and failing on those bricks a
 * database that worked on the previous version.
 */
export function migrateCheckingForeignKeys(options: {
	db: MigrationDatabase;
	readPragma: ReadPragma;
	migrationsFolder: string;
	dbPath: string;
}): void {
	const { db, readPragma, migrationsFolder, dbPath } = options;
	const before = violationCountsByConstraint(readPragma);
	runMigrations(db, migrationsFolder);
	const after = violationCountsByConstraint(readPragma);
	const introduced = [...after.entries()].filter(
		([constraint, count]) => count > (before.get(constraint) ?? 0),
	);
	if (introduced.length > 0) {
		throw new Error(
			`[host-service:db] Migration at ${dbPath} introduced foreign key violation(s): ${JSON.stringify(introduced)}`,
		);
	}
	if (after.size > 0) {
		console.error(
			`[host-service:db] Pre-existing foreign key violation(s) survive at ${dbPath} (not introduced by migration, serving anyway): ${JSON.stringify([...after.entries()])}`,
		);
	}
}
