import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrations = join(import.meta.dir, "../../drizzle");
test("appearance migration preserves existing projects and scopes account colors to their organization and host", () => {
	const db = new Database(":memory:");
	try {
		for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
			if (file.startsWith("0060_")) continue;
			db.exec(readFileSync(join(migrations, file), "utf8"));
		}
		db.run("INSERT INTO projects (id, main_repo_path, name, color, last_opened_at, created_at) VALUES (?, ?, ?, ?, ?, ?)", ["project", "/fixture/project", "Existing project", "blue", 123, 100]);
		const before = db.query("SELECT * FROM projects WHERE id = ?").get("project");
		db.exec(readFileSync(join(migrations, "0060_usage_widget_appearances.sql"), "utf8"));
		expect(db.query("SELECT * FROM projects WHERE id = ?").get("project")).toEqual(before);
		const insert = db.query("INSERT INTO usage_widget_appearances (organization_id, host_id, account_id, color, label, updated_at) VALUES (?, ?, ?, ?, ?, ?)");
		insert.run("org-a", "host-a", "opaque-account", "#00FF80", "Work", 1000);
		insert.run("org-a", "host-b", "opaque-account", "#FF4080", "Personal", 1001);
		insert.run("org-b", "host-a", "opaque-account", "#0080FF", "Other org", 1002);
		expect(db.query("SELECT count(*) AS count FROM usage_widget_appearances").get()).toEqual({ count: 3 });
		expect(() => insert.run("org-a", "host-a", "opaque-account", "#FFFFFF", "Duplicate", 1003)).toThrow();
		expect(db.query("SELECT color, label FROM usage_widget_appearances WHERE organization_id = ? AND host_id = ? AND account_id = ?").get("org-a", "host-a", "opaque-account")).toEqual({ color: "#00FF80", label: "Work" });
	} finally {
		db.close();
	}
});
