import { expect, test } from "bun:test";
import { backfillSnapshotExpiration } from "./backfill-snapshot-expiration";

const boxes = [
	{ name: "ws-default", snapshotExpiration: undefined },
	{ name: "ws-30d", snapshotExpiration: 30 * 24 * 60 * 60 * 1000 },
	{ name: "ws-done", snapshotExpiration: 0 },
];

test("changes only boxes that still expire, paced, and only with --apply", async () => {
	const updated: string[] = [];
	const slept: number[] = [];
	const host = {
		listWorkspaceBoxes: async () => boxes,
		neverExpire: async (name: string) => {
			updated.push(name);
		},
		sleep: async (ms: number) => {
			slept.push(ms);
		},
	};
	const dry = await backfillSnapshotExpiration({
		host,
		apply: false,
		perSecond: 2,
		log: () => {},
	});
	expect(dry).toMatchObject({ pending: 2, updated: 0 });
	expect(updated).toEqual([]);

	await backfillSnapshotExpiration({
		host,
		apply: true,
		perSecond: 2,
		log: () => {},
	});
	expect(updated).toEqual(["ws-default", "ws-30d"]);
	expect(slept).toEqual([500]);
});
