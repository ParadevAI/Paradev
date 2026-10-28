import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const migrations = fileURLToPath(new URL("../../drizzle", import.meta.url));
const appearanceMigration = "0060_usage_widget_appearances.sql";
const migrationsBeforeAppearance = (files: string[]) =>
	files
		.filter((name) => name.endsWith(".sql") && name < appearanceMigration)
		.sort();

test("appearance migration setup excludes the target and future migrations", () => {
	assert.deepEqual(
		migrationsBeforeAppearance([
			"0061_future.sql",
			appearanceMigration,
			"0059_previous.sql",
			"_journal.json",
		]),
		["0059_previous.sql"],
	);
});

test("appearance migration preserves existing projects and scopes account colors to their organization and host", () => {
	const db = new DatabaseSync(":memory:");
	try {
		db.function("uuid_v4", () => randomUUID());
		db.function("uuid_is_valid_v4", (value) =>
			typeof value === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				value,
			)
				? 1
				: 0,
		);
		for (const file of migrationsBeforeAppearance(readdirSync(migrations))) {
			db.exec(readFileSync(join(migrations, file), "utf8"));
		}
		db.prepare(
			"INSERT INTO projects (id, main_repo_path, name, color, last_opened_at, created_at) VALUES (?, ?, ?, ?, ?, ?)",
		).run("project", "/fixture/project", "Existing project", "blue", 123, 100);
		const before = db
			.prepare("SELECT * FROM projects WHERE id = ?")
			.get("project");
		db.exec(readFileSync(join(migrations, appearanceMigration), "utf8"));
		assert.deepEqual(
			db.prepare("SELECT * FROM projects WHERE id = ?").get("project"),
			before,
		);
		const insert = db.prepare(
			"INSERT INTO usage_widget_appearances (organization_id, host_id, account_id, color, label, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		);
		insert.run("org-a", "host-a", "opaque-account", "#00FF80", "Work", 1000);
		insert.run(
			"org-a",
			"host-b",
			"opaque-account",
			"#FF4080",
			"Personal",
			1001,
		);
		insert.run(
			"org-b",
			"host-a",
			"opaque-account",
			"#0080FF",
			"Other org",
			1002,
		);
		assert.equal(
			db.prepare("SELECT count(*) AS count FROM usage_widget_appearances").get()
				?.count,
			3,
		);

		assert.throws(() =>
			insert.run(
				"org-a",
				"host-a",
				"opaque-account",
				"#FFFFFF",
				"Duplicate",
				1003,
			),
		);
		assert.deepEqual(
			{
				...db
					.prepare(
						"SELECT color, label FROM usage_widget_appearances WHERE organization_id = ? AND host_id = ? AND account_id = ?",
					)
					.get("org-a", "host-a", "opaque-account"),
			},
			{ color: "#00FF80", label: "Work" },
		);
	} finally {
		db.close();
	}
});
