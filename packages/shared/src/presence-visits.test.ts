import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { SqlLike } from "./page-storage-records";
import { PresenceVisits } from "./presence-visits";

function visitsIn(db: Database): PresenceVisits {
	const sql: SqlLike = {
		exec: (query, ...bindings) => {
			const rows = db.query(query).all(...(bindings as never[])) as never[];
			return { toArray: () => rows };
		},
	};
	const visits = new PresenceVisits(sql);
	visits.ensureSchema();
	return visits;
}

test("recent visits are newest first and capped", () => {
	const visits = visitsIn(new Database(":memory:"));
	visits.record({ userId: "ana", name: "Ana", image: null }, 1);
	visits.record({ userId: "ben", name: "Ben", image: null }, 2);
	visits.touch("ana", 5);
	expect(visits.recent(1)).toEqual([
		{ userId: "ana", name: "Ana", image: null, lastSeenAt: 5 },
	]);
	expect(visits.recent(10).map((visit) => visit.userId)).toEqual([
		"ana",
		"ben",
	]);
});

test("a visit with no name keeps the stored name and image", () => {
	const visits = visitsIn(new Database(":memory:"));
	visits.record({ userId: "ana", name: "Ana", image: "a.png" }, 1);
	visits.record({ userId: "ana", name: null, image: null }, 2);
	expect(visits.recent(1)).toEqual([
		{ userId: "ana", name: "Ana", image: "a.png", lastSeenAt: 2 },
	]);
});
