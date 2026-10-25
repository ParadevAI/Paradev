import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { usageWidgetAppearances } from "@superset/local-db/schema/usage-widget-appearances";
import {
	type MigrationDatabase,
	runMigrations,
} from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import {
	createWidgetAppearanceStore,
	type WidgetAppearanceInventory,
} from "./appearance";

const IDENTITY = "a".repeat(64);
const SECOND_IDENTITY = "b".repeat(64);
const ACCOUNT = `claude:${IDENTITY}`;
const SECOND_ACCOUNT = `claude:${SECOND_IDENTITY}`;
const MIGRATION = join(
	import.meta.dir,
	"../../../../../../packages/local-db/drizzle/0060_usage_widget_appearances.sql",
);

describe("widget account appearance storage", () => {
	let sqlite: Database;
	let organizationId: string;
	let inventory: WidgetAppearanceInventory;
	let store: ReturnType<typeof createWidgetAppearanceStore>;

	beforeEach(() => {
		sqlite = new Database(":memory:");
		sqlite.exec(
			"CREATE TABLE settings (id INTEGER PRIMARY KEY, value TEXT); INSERT INTO settings VALUES (1, 'preserved'); CREATE TABLE chats (id TEXT PRIMARY KEY, transcript TEXT); INSERT INTO chats VALUES ('native-session', 'preserved');",
		);
		sqlite.exec(readFileSync(MIGRATION, "utf8"));
		organizationId = "organization-one";
		inventory = {
			accounts: [{ id: ACCOUNT, quotaIdentity: IDENTITY, status: "ok" }],
			complete: true,
			fresh: true,
		};
		store = createWidgetAppearanceStore({
			db: drizzle(sqlite),
			getOrganizationId: () => organizationId,
			getInventory: () => inventory,
			now: () => 1234,
		});
	});

	afterEach(() => sqlite.close());

	test("upgrades the actual previous local schema once and preserves workspace and organization settings", () => {
		const migrationSqlite = new DatabaseSync(":memory:");
		const dialect = new SQLiteSyncDialect();
		const db: MigrationDatabase = {
			run(query) {
				const { sql, params } = dialect.sqlToQuery(query);
				return migrationSqlite.prepare(sql).run(...(params as SQLInputValue[]));
			},
			all<TRow>(query: Parameters<MigrationDatabase["run"]>[0]) {
				const { sql, params } = dialect.sqlToQuery(query);
				return migrationSqlite
					.prepare(sql)
					.all(...(params as SQLInputValue[])) as TRow[];
			},
		};
		try {
			migrationSqlite.function("uuid_v4", () => randomUUID());
			migrationSqlite.function("uuid_is_valid_v4", (value) =>
				typeof value === "string" &&
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
					value,
				)
					? 1
					: 0,
			);
			migrationSqlite.exec(
				"PRAGMA foreign_keys = OFF; CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, hash TEXT NOT NULL, created_at NUMERIC)",
			);
			const folder = join(MIGRATION, "..");
			const migrations = readMigrationFiles({ migrationsFolder: folder });
			for (const migration of migrations.slice(0, -1)) {
				for (const statement of migration.sql) migrationSqlite.exec(statement);
				migrationSqlite
					.prepare(
						"INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
					)
					.run(migration.hash, migration.folderMillis);
			}
			migrationSqlite.exec(
				"INSERT INTO settings (id, active_organization_id, last_active_workspace_id) VALUES (1, 'organization-one', 'saved-workspace'); INSERT INTO projects (id, main_repo_path, name, color, last_opened_at, created_at) VALUES ('saved-project', '/private/fixture-project', 'Project', '#123456', 1, 1); INSERT INTO workspaces (id, project_id, type, branch, name, tab_order, created_at, updated_at, last_opened_at) VALUES ('saved-workspace', 'saved-project', 'branch', 'main', 'Workspace', 1, 1, 1, 1)",
			);
			const settings = migrationSqlite.prepare("SELECT * FROM settings").all();
			const projects = migrationSqlite.prepare("SELECT * FROM projects").all();
			const workspaces = migrationSqlite
				.prepare("SELECT * FROM workspaces")
				.all();
			runMigrations(db, folder);
			runMigrations(db, folder);
			expect(migrationSqlite.prepare("SELECT * FROM settings").all()).toEqual(
				settings,
			);
			expect(migrationSqlite.prepare("SELECT * FROM projects").all()).toEqual(
				projects,
			);
			expect(migrationSqlite.prepare("SELECT * FROM workspaces").all()).toEqual(
				workspaces,
			);
			expect(
				migrationSqlite.prepare("SELECT * FROM usage_widget_appearances").all(),
			).toEqual([]);
			expect(
				migrationSqlite
					.prepare("SELECT COUNT(*) AS count FROM __drizzle_migrations")
					.get(),
			).toEqual({ count: migrations.length });
		} finally {
			migrationSqlite.close();
		}
	});

	test("persists normalized RGB and account labels without changing other data", () => {
		store.writeWidgetAppearance("host-one", ACCOUNT, {
			color: "#12abEF",
			label: " Work ",
		});
		expect(store.readWidgetAppearances("host-one")).toEqual({
			[ACCOUNT]: { color: "#12ABEF", label: "Work" },
		});
		expect(sqlite.query("SELECT * FROM settings").all()).toEqual([
			{ id: 1, value: "preserved" },
		]);
		expect(sqlite.query("SELECT * FROM chats").all()).toEqual([
			{ id: "native-session", transcript: "preserved" },
		]);
		expect(
			sqlite.query("SELECT * FROM usage_widget_appearances").get(),
		).toEqual({
			organization_id: "organization-one",
			host_id: "host-one",
			account_id: ACCOUNT,
			color: "#12ABEF",
			label: "Work",
			updated_at: 1234,
		});
	});

	test("updates only supplied fields and removes a fully cleared appearance", () => {
		store.writeWidgetAppearance("host-one", ACCOUNT, {
			color: "#123456",
			label: "Work",
		});
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: "#654321" });
		expect(store.readWidgetAppearances("host-one")[ACCOUNT]).toEqual({
			color: "#654321",
			label: "Work",
		});
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: null });
		expect(store.readWidgetAppearances("host-one")[ACCOUNT]).toEqual({
			color: null,
			label: "Work",
		});
		store.writeWidgetAppearance("host-one", ACCOUNT, { label: " " });
		expect(store.readWidgetAppearances("host-one")).toEqual({});
	});

	test("isolates the same identity across hosts and organizations", () => {
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: "#123456" });
		store.writeWidgetAppearance("host-two", ACCOUNT, { color: "#654321" });
		organizationId = "organization-two";
		expect(store.readWidgetAppearances("host-one")).toEqual({});
		store.writeWidgetAppearance("host-one", ACCOUNT, {
			label: "Other organization",
		});
		organizationId = "organization-one";
		expect(store.readWidgetAppearances("host-one")[ACCOUNT]?.color).toBe(
			"#123456",
		);
		expect(store.readWidgetAppearances("host-two")[ACCOUNT]?.color).toBe(
			"#654321",
		);
	});

	test("rejects invalid RGB, excessive labels, control characters and unknown fields", () => {
		for (const color of ["red", "#fff", "#12345678", "rgb(1,2,3)", "#12345g"]) {
			expect(() =>
				store.writeWidgetAppearance("host-one", ACCOUNT, { color }),
			).toThrow();
		}
		for (const label of [
			"a".repeat(81),
			"work\naccount",
			"work\u007faccount",
		]) {
			expect(() =>
				store.writeWidgetAppearance("host-one", ACCOUNT, { label }),
			).toThrow();
		}
		expect(() =>
			store.writeWidgetAppearance("host-one", ACCOUNT, {
				color: "#123456",
				token: "ignored",
			} as { color: string }),
		).toThrow();
		expect(store.readWidgetAppearances("host-one")).toEqual({});
	});

	test("refuses source-only, mismatched and stale account identities", () => {
		for (const account of [
			{ id: "claude:/private/profile", status: "ok" },
			{ id: ACCOUNT, quotaIdentity: SECOND_IDENTITY, status: "ok" },
			{ id: ACCOUNT, quotaIdentity: IDENTITY, status: "unavailable" },
		]) {
			inventory.accounts = [account];
			expect(() =>
				store.writeWidgetAppearance("host-one", account.id, {
					color: "#123456",
				}),
			).toThrow();
		}
		inventory.accounts = [
			{ id: ACCOUNT, quotaIdentity: IDENTITY, status: "ok" },
		];
		inventory.fresh = false;
		expect(() =>
			store.writeWidgetAppearance("host-one", ACCOUNT, { label: "Work" }),
		).toThrow();
		expect(store.readWidgetAppearances("host-one")).toEqual({});
	});

	test("does not transfer metadata when the source signs into another account", () => {
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: "#123456" });
		inventory.accounts = [
			{ id: SECOND_ACCOUNT, quotaIdentity: SECOND_IDENTITY, status: "ok" },
		];
		expect(
			store.readWidgetAppearances("host-one")[SECOND_ACCOUNT],
		).toBeUndefined();
		expect(() =>
			store.writeWidgetAppearance("host-one", ACCOUNT, { color: "#654321" }),
		).toThrow();
	});

	test("retains appearances for missing, stale or partially unavailable inventories", () => {
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: "#123456" });
		inventory.accounts = [];
		inventory.complete = false;
		expect(store.pruneWidgetAppearances("host-one")).toBe(0);
		inventory.complete = true;
		inventory.fresh = false;
		expect(store.pruneWidgetAppearances("host-one")).toBe(0);
		inventory.fresh = true;
		inventory.accounts = [{ id: SECOND_ACCOUNT, status: "unavailable" }];
		expect(store.pruneWidgetAppearances("host-one")).toBe(0);
		expect(store.readWidgetAppearances("host-one")[ACCOUNT]?.color).toBe(
			"#123456",
		);
	});

	test("prunes only absent metadata in the authoritative current host scope", () => {
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: "#123456" });
		store.writeWidgetAppearance("host-two", ACCOUNT, { color: "#654321" });
		organizationId = "organization-two";
		store.writeWidgetAppearance("host-one", ACCOUNT, {
			label: "Other organization",
		});
		organizationId = "organization-one";
		inventory.accounts = [];
		expect(store.pruneWidgetAppearances("host-one")).toBe(1);
		expect(store.readWidgetAppearances("host-one")).toEqual({});
		expect(store.readWidgetAppearances("host-two")[ACCOUNT]?.color).toBe(
			"#654321",
		);
		organizationId = "organization-two";
		expect(store.readWidgetAppearances("host-one")[ACCOUNT]?.label).toBe(
			"Other organization",
		);
	});

	test("bounds new metadata while allowing existing accounts to update or clear", () => {
		const db = drizzle(sqlite);
		db.insert(usageWidgetAppearances)
			.values(
				Array.from({ length: 5_000 }, (_, index) => ({
					organizationId,
					hostId: "host-one",
					accountId:
						index === 0
							? ACCOUNT
							: `codex:${index.toString(16).padStart(64, "0")}`,
					color: "#123456",
					updatedAt: 0,
				})),
			)
			.run();
		inventory.accounts = [
			{ id: ACCOUNT, quotaIdentity: IDENTITY, status: "ok" },
			{ id: SECOND_ACCOUNT, quotaIdentity: SECOND_IDENTITY, status: "ok" },
		];
		expect(() =>
			store.writeWidgetAppearance("host-one", SECOND_ACCOUNT, {
				color: "#654321",
			}),
		).toThrow();
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: "#654321" });
		expect(store.readWidgetAppearances("host-one")[ACCOUNT]?.color).toBe(
			"#654321",
		);
		store.writeWidgetAppearance("host-one", ACCOUNT, { color: null });
		store.writeWidgetAppearance("host-one", SECOND_ACCOUNT, {
			color: "#654321",
		});
		expect(store.readWidgetAppearances("host-one")[SECOND_ACCOUNT]?.color).toBe(
			"#654321",
		);
	});
});
