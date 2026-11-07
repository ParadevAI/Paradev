import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import type { SqlLike } from "@superset/shared/page-storage-records";
import { parseForwardsReport, WorkspaceForwards } from "./forwards";

function forwardsIn(db: Database): WorkspaceForwards {
	const sql: SqlLike = {
		exec: (query, ...bindings) => {
			const rows = db.query(query).all(...(bindings as never[])) as never[];
			return { toArray: () => rows };
		},
	};
	const forwards = new WorkspaceForwards(sql);
	forwards.ensureSchema();
	return forwards;
}

const ana = { id: "ana", name: "Ana", image: null };
const bo = { id: "bo", name: "Bo", image: null };

test("a report is read back per person, by port, and a dropped connection is pruned", () => {
	const forwards = forwardsIn(new Database(":memory:"));
	forwards.report("c1", ana, [{ port: 5173, localPort: 5174 }], 1);
	forwards.report(
		"c2",
		bo,
		[
			{ port: 5173, localPort: 5173 },
			{ port: 3000, localPort: 3000 },
		],
		2,
	);

	expect(forwards.list(new Set(["c1", "c2"]))).toEqual([
		{ port: 3000, localPort: 3000, since: 2, user: bo },
		{ port: 5173, localPort: 5174, since: 1, user: ana },
		{ port: 5173, localPort: 5173, since: 2, user: bo },
	]);
	expect(forwards.list(new Set(["c2"])).map((f) => f.user.id)).toEqual([
		"bo",
		"bo",
	]);
	expect(forwards.list(new Set(["c1", "c2"])).map((f) => f.user.id)).toEqual([
		"bo",
		"bo",
	]);
});

test("a new report keeps since for unchanged ports and drops stopped ones", () => {
	const forwards = forwardsIn(new Database(":memory:"));
	forwards.report(
		"c1",
		ana,
		[
			{ port: 5173, localPort: 5173 },
			{ port: 3000, localPort: 3000 },
		],
		1,
	);
	forwards.report(
		"c1",
		ana,
		[
			{ port: 5173, localPort: 5173 },
			{ port: 8080, localPort: 8081 },
		],
		9,
	);
	expect(forwards.list(new Set(["c1"])).map((f) => [f.port, f.since])).toEqual([
		[5173, 1],
		[8080, 9],
	]);
	forwards.remove("c1");
	expect(forwards.list(new Set(["c1"]))).toEqual([]);
});

test("a port that moves in the same millisecond is still recorded", () => {
	const forwards = forwardsIn(new Database(":memory:"));
	forwards.report("c1", ana, [{ port: 5173, localPort: 5173 }], 5);
	forwards.report("c1", ana, [{ port: 5173, localPort: 5174 }], 5);
	expect(forwards.list(new Set(["c1"])).map((f) => f.localPort)).toEqual([
		5174,
	]);
});

test("only well-formed reports are accepted", () => {
	expect(
		parseForwardsReport(
			JSON.stringify({
				type: "forwards",
				forwards: [{ port: 5173, localPort: 5174 }],
			}),
		),
	).toEqual([{ port: 5173, localPort: 5174 }]);
	expect(parseForwardsReport("ping")).toBeNull();
	expect(
		parseForwardsReport(JSON.stringify({ type: "other", forwards: [] })),
	).toBeNull();
	expect(
		parseForwardsReport(
			JSON.stringify({
				type: "forwards",
				forwards: [{ port: 0, localPort: 1 }],
			}),
		),
	).toBeNull();
	const tooMany = Array.from({ length: 51 }, (_, i) => ({
		port: i + 1,
		localPort: i + 1,
	}));
	expect(
		parseForwardsReport(
			JSON.stringify({ type: "forwards", forwards: tooMany }),
		),
	).toBeNull();
});
