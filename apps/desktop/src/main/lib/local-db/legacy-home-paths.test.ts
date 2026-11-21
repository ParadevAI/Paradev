import { describe, expect, test } from "bun:test";
import { is } from "drizzle-orm";
import { getTableConfig, SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "../../../../../../packages/local-db/src/schema/schema";
import { PATH_COLUMNS } from "./legacy-home-paths";

describe("local.db legacy home paths", () => {
	test("every rewritten column exists in the schema", () => {
		const columnsByTable = new Map(
			(Object.values(schema) as unknown[])
				.filter((value): value is SQLiteTable => is(value, SQLiteTable))
				.map((table) => {
					const config = getTableConfig(table);
					return [config.name, config.columns.map((column) => column.name)];
				}),
		);

		for (const [table, column] of PATH_COLUMNS) {
			expect(columnsByTable.get(table)).toContain(column);
		}
	});
});
