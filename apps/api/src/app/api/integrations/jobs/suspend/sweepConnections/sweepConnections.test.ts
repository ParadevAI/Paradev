import { expect, test } from "bun:test";
import { sweepConnections } from "./sweepConnections";

test("a billing sweep stops at its budget and resumes after its last checked connection", async () => {
	const rows = ["a", "b", "c"].map((id) => ({ id, organizationId: id }));
	let cursor: string | null = null;
	let time = 0;
	const visits: string[] = [];
	const deps = {
		rows,
		deadline: 1,
		now: () => time,
		syncing: async (ids: string[]) => new Set(ids),
		checkpoint: async (value: string | null) => {
			cursor = value;
		},
		visit: async (row: (typeof rows)[number], allowed: boolean) => {
			expect(allowed).toBe(true);
			visits.push(row.id);
			time++;
			return true;
		},
	};
	expect(await sweepConnections({ ...deps, cursor })).toEqual({
		checked: 1,
		deferred: 2,
	});
	expect(cursor).toBe("a");
	await sweepConnections({ ...deps, deadline: 3, cursor });
	expect(visits).toEqual(["a", "b", "c"]);
	expect(cursor).toBe("c");
});
