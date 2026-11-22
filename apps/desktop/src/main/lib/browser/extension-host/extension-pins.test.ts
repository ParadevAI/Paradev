import { Database } from "bun:sqlite";
import { afterAll, expect, test } from "bun:test";
import {
	copyFileSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMigrations } from "@superset/shared/sqlite-migrations";
import { drizzle } from "drizzle-orm/bun-sqlite";
// The desktop test preload mocks @superset/local-db, so the real table comes from source.
import { settings } from "../../../../../../../packages/local-db/src/schema/schema";
import { createExtensionPins } from "./extension-pins";

const MIGRATIONS = join(
	import.meta.dir,
	"../../../../../../../packages/local-db/drizzle",
);
const scratch = mkdtempSync(join(tmpdir(), "extension-pins-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// bun:sqlite cannot register the app's uuid_* SQL functions, so the
// migrations that call them are left out.
function migrationsBunCanRun(): string {
	const journal = JSON.parse(
		readFileSync(join(MIGRATIONS, "meta/_journal.json"), "utf8"),
	) as { entries: { tag: string }[] };
	const sqlOf = (tag: string) => join(MIGRATIONS, `${tag}.sql`);
	journal.entries = journal.entries.filter(
		({ tag }) => !readFileSync(sqlOf(tag), "utf8").includes("uuid_"),
	);
	mkdirSync(join(scratch, "meta"), { recursive: true });
	for (const { tag } of journal.entries) {
		copyFileSync(sqlOf(tag), join(scratch, `${tag}.sql`));
	}
	writeFileSync(join(scratch, "meta/_journal.json"), JSON.stringify(journal));
	return scratch;
}

test("pins round-trip through the settings row", () => {
	const db = drizzle(new Database(":memory:"));
	runMigrations(db, migrationsBunCanRun());

	const pins = createExtensionPins(db, settings);
	pins.setPinned("keyring", true);
	pins.setPinned("eyedropper", true);
	pins.setPinned("keyring", true);
	pins.setPinned("keyring", false);

	expect(createExtensionPins(db, settings).pinnedIds()).toEqual(["eyedropper"]);
});

test("a legacy settings row with another id keeps the pins, with no second row", () => {
	const db = drizzle(new Database(":memory:"));
	runMigrations(db, migrationsBunCanRun());
	db.insert(settings).values({ id: 7 }).run();

	createExtensionPins(db, settings).setPinned("keyring", true);

	expect(db.select({ id: settings.id }).from(settings).all()).toEqual([
		{ id: 7 },
	]);
	expect(createExtensionPins(db, settings).pinnedIds()).toEqual(["keyring"]);
});
