import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { MAX_PAGE_STORAGE_KEYS_PER_USER } from "./page-storage";
import { PageStorageRecords, type SqlLike } from "./page-storage-records";

function sqlite(db: Database): SqlLike {
	return {
		exec: (query, ...bindings) => {
			const rows = db.query(query).all(...(bindings as never[])) as never[];
			return { toArray: () => rows };
		},
	};
}

let db: Database;
let records: PageStorageRecords;

beforeEach(() => {
	db = new Database(":memory:");
	records = new PageStorageRecords(sqlite(db));
	records.ensureSchema();
	records.recordVisit({ userId: "ana", name: "Ana", image: null }, 1);
	records.recordVisit({ userId: "ben", name: "Ben", image: null }, 1);
});

describe("slot scope", () => {
	test("each person has their own slot and everyone reads all of them", () => {
		records.set("slot", "vote", "ana", "Ramen", 10);
		records.set("slot", "vote", "ben", "Tacos", 11);
		expect(records.get("slot", "vote", "ana")).toBe("Ramen");
		expect(
			records.list("slot", "vote", "ben").map((r) => [r.name, r.value]),
		).toEqual([
			["Ana", "Ramen"],
			["Ben", "Tacos"],
		]);
	});
});

describe("private scope", () => {
	test("only the writer reads it", () => {
		records.set("private", "draft", "ana", "secret", 10);
		expect(records.get("private", "draft", "ana")).toBe("secret");
		expect(records.get("private", "draft", "ben")).toBeNull();
		expect(records.list("private", "draft", "ben")).toEqual([]);
		expect(records.list("private", "draft", "ana")).toHaveLength(1);
	});
});

describe("shared scope", () => {
	test("one value per key, the last writer wins and is named", () => {
		records.set("shared", "status", "ana", "open", 10);
		records.set("shared", "status", "ben", "closed", 11);
		expect(records.get("shared", "status", "ana")).toBe("closed");
		const [only, ...rest] = records.list("shared", "status", "ana");
		expect(rest).toEqual([]);
		expect(only?.userId).toBe("ben");
		expect(only?.name).toBe("Ben");
	});

	test("anyone can remove it", () => {
		records.set("shared", "status", "ana", "open", 10);
		records.remove("shared", "status", "ben");
		expect(records.get("shared", "status", "ana")).toBeNull();
	});

	test("a shared key counts against whoever created it, not the last writer", () => {
		const max = MAX_PAGE_STORAGE_KEYS_PER_USER;
		for (let i = 0; i < max; i++) {
			expect(records.set("shared", `k${i}`, "ana", i, 10)).toBeNull();
		}
		expect(records.set("shared", "ben-0", "ben", 0, 10)).toBeNull();
		for (let i = 1; i < max - 1; i++) {
			expect(records.set("private", `ben-${i}`, "ben", i, 10)).toBeNull();
		}
		expect(records.set("shared", "k1", "ben", "taken over", 11)).toBeNull();
		expect(records.set("slot", "ben-last", "ben", 1, 11)).toBeNull();
		expect(records.set("slot", "ben-over", "ben", 1, 11)?.code).toBe(
			"quota_exceeded",
		);
		for (const scope of ["shared", "slot", "private"] as const) {
			expect(records.set(scope, "ana-new", "ana", 1, 12)?.code).toBe(
				"quota_exceeded",
			);
		}
		expect(records.set("shared", "k0", "ana", "again", 12)).toBeNull();
		expect(records.set("shared", "k1", "ana", "back", 12)).toBeNull();
		expect(records.set("shared", "ben-0", "ana", "edit", 12)).toBeNull();
		expect(records.set("slot", "ben-last", "ben", 2, 12)).toBeNull();
	});
});

test("the same key in two scopes is two rows", () => {
	records.set("slot", "draft", "ana", "public", 10);
	records.set("private", "draft", "ana", "hidden", 11);
	records.set("shared", "draft", "ana", "team", 12);
	records.remove("private", "draft", "ana");
	expect(records.get("slot", "draft", "ana")).toBe("public");
	expect(records.get("private", "draft", "ana")).toBeNull();
	expect(records.get("shared", "draft", "ana")).toBe("team");
});

test("keys and lists never show another person's private rows", () => {
	records.set("private", "draft", "ana", "hidden", 10);
	records.set("slot", "vote", "ben", "Tacos", 11);
	expect(records.keys("ben").map((k) => [k.scope, k.key])).toEqual([
		["slot", "vote"],
	]);
	expect(records.keys("ana").map((k) => [k.scope, k.key])).toEqual([
		["private", "draft"],
		["slot", "vote"],
	]);
});

test("clearUser keeps shared values but forgets who wrote them", () => {
	records.set("slot", "vote", "ana", "Ramen", 10);
	records.set("private", "draft", "ana", "hidden", 10);
	records.set("shared", "status", "ana", "open", 10);
	expect(records.clearUser("ana")).toEqual({ cleared: 2, anonymized: 1 });
	expect(records.get("slot", "vote", "ana")).toBeNull();
	expect(records.get("private", "draft", "ana")).toBeNull();
	const [shared] = records.list("shared", "status", "ben");
	expect(shared?.value).toBe("open");
	expect(shared?.userId).toBe("");
	expect(shared?.name).toBe("Someone");
});

test("clear by key removes it from every scope", () => {
	records.set("slot", "k", "ana", 1, 10);
	records.set("shared", "k", "ana", 2, 10);
	records.set("slot", "other", "ana", 3, 10);
	expect(records.clear("k")).toBe(2);
	expect(records.scopedKeys()).toEqual([
		{ scope: "slot", key: "other", owner: null },
	]);
});

test("scopedKeys names the owner of each private key", () => {
	records.set("private", "draft", "ana", 1, 10);
	records.set("private", "draft", "ben", 2, 10);
	records.set("shared", "draft", "ana", 3, 10);
	expect(records.scopedKeys()).toEqual([
		{ scope: "private", key: "draft", owner: "ana" },
		{ scope: "private", key: "draft", owner: "ben" },
		{ scope: "shared", key: "draft", owner: null },
	]);
});

test("a visit with no name keeps the stored name and image", () => {
	records.recordVisit({ userId: "ana", name: "Ana", image: "a.png" }, 2);
	records.recordVisit({ userId: "ana", name: null, image: null }, 3);
	records.recordVisit({ userId: "cy", name: null, image: null }, 3);
	records.set("slot", "vote", "ana", "Ramen", 10);
	records.set("slot", "vote", "cy", "Tacos", 11);
	expect(
		records.list("slot", "vote", "ana").map((r) => [r.name, r.image]),
	).toEqual([
		["Ana", "a.png"],
		["Someone", null],
	]);
});

test("copies a legacy records table once and keeps it", () => {
	const legacy = new Database(":memory:");
	legacy.run(`CREATE TABLE records (
		key TEXT NOT NULL, user_id TEXT NOT NULL, value TEXT NOT NULL,
		size_bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL,
		PRIMARY KEY (key, user_id))`);
	legacy.run(
		"INSERT INTO records VALUES ('vote', 'ana', '\"Ramen\"', 7, 5), ('vote', 'ben', '\"Tacos\"', 7, 6)",
	);
	const migrated = new PageStorageRecords(sqlite(legacy));
	migrated.ensureSchema();
	expect(
		migrated.list("slot", "vote", "ana").map((r) => [r.userId, r.value]),
	).toEqual([
		["ana", "Ramen"],
		["ben", "Tacos"],
	]);
	expect(
		legacy.query("SELECT created_by FROM entries ORDER BY created_by").all(),
	).toEqual([{ created_by: "ana" }, { created_by: "ben" }]);
	const kept = legacy.query("SELECT count(*) AS n FROM records").get() as {
		n: number;
	};
	expect(kept.n).toBe(2);
});

test("a hub woken later does not copy rows back after a remove", () => {
	const legacy = new Database(":memory:");
	legacy.run(`CREATE TABLE records (
		key TEXT NOT NULL, user_id TEXT NOT NULL, value TEXT NOT NULL,
		size_bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL,
		PRIMARY KEY (key, user_id))`);
	legacy.run("INSERT INTO records VALUES ('vote', 'ana', '\"Ramen\"', 7, 5)");
	const first = new PageStorageRecords(sqlite(legacy));
	first.ensureSchema();
	first.remove("slot", "vote", "ana");
	const woken = new PageStorageRecords(sqlite(legacy));
	woken.ensureSchema();
	expect(woken.get("slot", "vote", "ana")).toBeNull();
});

test("a failed legacy copy leaves no copied rows", () => {
	const legacy = new Database(":memory:");
	legacy.run(`CREATE TABLE records (
		key TEXT NOT NULL, user_id TEXT NOT NULL, value TEXT NOT NULL,
		size_bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL,
		PRIMARY KEY (key, user_id))`);
	legacy.run("INSERT INTO records VALUES ('vote', 'ana', '\"Ramen\"', 7, 5)");
	const base = sqlite(legacy);
	const failing: SqlLike = {
		exec: (query, ...bindings) => {
			if (query.startsWith("CREATE TABLE entries_migrated")) {
				throw new Error("interrupted");
			}
			return base.exec(query, ...bindings);
		},
	};
	const interrupted = new PageStorageRecords(failing, (fn) =>
		legacy.transaction(fn)(),
	);
	expect(() => interrupted.ensureSchema()).toThrow("interrupted");
	const copied = legacy.query("SELECT count(*) AS n FROM entries").get() as {
		n: number;
	};
	expect(copied.n).toBe(0);
});

describe("with a legacy records table", () => {
	let legacy: Database;
	let migrated: PageStorageRecords;

	const legacyRows = () =>
		legacy
			.query("SELECT key, user_id FROM records ORDER BY key, user_id")
			.all() as { key: string; user_id: string }[];

	beforeEach(() => {
		legacy = new Database(":memory:");
		legacy.run(`CREATE TABLE records (
			key TEXT NOT NULL, user_id TEXT NOT NULL, value TEXT NOT NULL,
			size_bytes INTEGER NOT NULL, updated_at INTEGER NOT NULL,
			PRIMARY KEY (key, user_id))`);
		legacy.run(
			"INSERT INTO records VALUES ('vote', 'ana', '1', 1, 5), ('vote', 'ben', '2', 1, 6), ('note', 'ana', '3', 1, 7)",
		);
		migrated = new PageStorageRecords(sqlite(legacy));
		migrated.ensureSchema();
	});

	test("clearUser removes the person's legacy rows too", () => {
		migrated.clearUser("ana");
		expect(legacyRows()).toEqual([{ key: "vote", user_id: "ben" }]);
	});

	test("clear by key removes the key's legacy rows too", () => {
		migrated.clear("vote");
		expect(legacyRows()).toEqual([{ key: "note", user_id: "ana" }]);
	});

	test("removing a slot value removes its legacy row", () => {
		migrated.remove("slot", "vote", "ana");
		migrated.remove("shared", "note", "ana");
		migrated.remove("private", "note", "ana");
		expect(legacyRows()).toEqual([
			{ key: "note", user_id: "ana" },
			{ key: "vote", user_id: "ben" },
		]);
	});

	test("clear with no key and clearAll empty the legacy table", () => {
		migrated.clear();
		expect(legacyRows()).toEqual([]);
		legacy.run("INSERT INTO records VALUES ('vote', 'ana', '1', 1, 5)");
		migrated.clearAll();
		expect(legacyRows()).toEqual([]);
	});
});

test("clearUser forgets who created a shared key someone else last wrote", () => {
	records.set("shared", "status", "ana", "open", 10);
	records.set("shared", "status", "ben", "closed", 11);
	expect(records.clearUser("ana")).toEqual({ cleared: 0, anonymized: 1 });
	expect(db.query("SELECT created_by, updated_by FROM entries").all()).toEqual([
		{ created_by: null, updated_by: "ben" },
	]);
});

test("an entries table from an earlier build gains created_by", () => {
	const earlier = new Database(":memory:");
	earlier.run(`CREATE TABLE entries (
		scope TEXT NOT NULL, key TEXT NOT NULL, user_id TEXT NOT NULL,
		updated_by TEXT, value TEXT NOT NULL, size_bytes INTEGER NOT NULL,
		updated_at INTEGER NOT NULL, PRIMARY KEY (scope, key, user_id))`);
	earlier.run(
		"INSERT INTO entries VALUES ('shared', 'status', '', 'ben', '1', 1, 5), ('slot', 'vote', 'ana', 'ana', '2', 1, 6)",
	);
	const upgraded = new PageStorageRecords(sqlite(earlier));
	upgraded.ensureSchema();
	new PageStorageRecords(sqlite(earlier)).ensureSchema();
	expect(
		earlier.query("SELECT key, created_by FROM entries ORDER BY key").all(),
	).toEqual([
		{ key: "status", created_by: "ben" },
		{ key: "vote", created_by: "ana" },
	]);
	upgraded.set("shared", "status", "ana", 2, 7);
	expect(
		earlier.query("SELECT created_by FROM entries WHERE key = 'status'").get(),
	).toEqual({ created_by: "ben" });
});

test("clearUser counts shared rows it only anonymized", () => {
	records.set("shared", "status", "ana", "open", 10);
	expect(records.clearUser("ana")).toEqual({ cleared: 0, anonymized: 1 });
});

describe("listKeys", () => {
	test("returns the keys under a prefix in one scope, sorted by key", () => {
		records.set("slot", "pipeline:2", "ana", 1, 10);
		records.set("slot", "pipeline:1", "ana", 1, 10);
		records.set("slot", "pipeline:1", "ben", 2, 15);
		records.set("slot", "other", "ana", 1, 10);
		records.set("shared", "pipeline:3", "ana", 1, 10);
		expect(records.listKeys("slot", "pipeline:", "ana", 1000)).toEqual([
			{
				key: "pipeline:1",
				records: 2,
				updatedAt: new Date(15).toISOString(),
			},
			{
				key: "pipeline:2",
				records: 1,
				updatedAt: new Date(10).toISOString(),
			},
		]);
		expect(records.listKeys("slot", "", "ana", 1000).map((k) => k.key)).toEqual(
			["other", "pipeline:1", "pipeline:2"],
		);
	});

	test("matches %, _ and backslash in the prefix literally", () => {
		records.set("shared", "50%_off", "ana", 1, 10);
		records.set("shared", "50abcoff", "ana", 1, 10);
		records.set("shared", "a\\b", "ana", 1, 10);
		records.set("shared", "axb", "ana", 1, 10);
		expect(
			records.listKeys("shared", "50%_", "ana", 1000).map((k) => k.key),
		).toEqual(["50%_off"]);
		expect(
			records.listKeys("shared", "a\\", "ana", 1000).map((k) => k.key),
		).toEqual(["a\\b"]);
	});

	test("lists only the caller's own private keys", () => {
		records.set("private", "draft:ana", "ana", 1, 10);
		records.set("private", "draft:ben", "ben", 1, 10);
		records.set("private", "draft:both", "ana", 1, 10);
		records.set("private", "draft:both", "ben", 1, 10);
		expect(records.listKeys("private", "draft:", "ben", 1000)).toEqual([
			{ key: "draft:ben", records: 1, updatedAt: new Date(10).toISOString() },
			{ key: "draft:both", records: 1, updatedAt: new Date(10).toISOString() },
		]);
	});

	test("stops at the limit", () => {
		for (const key of ["c", "a", "b"]) records.set("slot", key, "ana", 1, 10);
		expect(records.listKeys("slot", "", "ana", 2).map((k) => k.key)).toEqual([
			"a",
			"b",
		]);
	});
});
