import { expect, test } from "bun:test";
import { missingCredentials, summarizeInventory } from "./inventory";

const GB = 1e9;
const snapshot = (id: string, gb: number, status = "created") => ({
	id,
	region: "iad1",
	status,
	sizeBytes: gb * GB,
	lastUsedAt: 1_700_000_000_000,
});

test("summarizeInventory joins names and splits goldens from workspaces", () => {
	const inventory = summarizeInventory(
		[
			snapshot("snap_env", 8),
			snapshot("snap_a", 1),
			snapshot("snap_b", 2),
			snapshot("snap_c", 3),
			snapshot("snap_orphan", 4),
			snapshot("snap_gone", 100, "deleted"),
		],
		[
			{ name: "env-internal", currentSnapshotId: "snap_env" },
			{ name: "ws-a", currentSnapshotId: "snap_a" },
			{ name: "ws-b", currentSnapshotId: "snap_b" },
			{ name: "ws-c", currentSnapshotId: "snap_c" },
			{ name: "ws-new" },
		],
	);
	expect(inventory.goldens).toEqual({
		count: 1,
		medianBytes: 8 * GB,
		p90Bytes: 8 * GB,
		maxBytes: 8 * GB,
	});
	expect(inventory.workspaces).toEqual({
		count: 4,
		medianBytes: 2 * GB,
		p90Bytes: 4 * GB,
		maxBytes: 4 * GB,
	});
	expect(inventory.totalBytes).toBe(18 * GB);
	expect(inventory.largest.map((row) => row.name)).toEqual([
		"env-internal",
		null,
		"ws-c",
		"ws-b",
		"ws-a",
	]);
	expect(inventory.rows[0]?.kind).toBe("golden");
});

test("missingCredentials flags absent and placeholder values", () => {
	expect(
		missingCredentials({
			VERCEL_SANDBOX_TOKEN: "fake-token",
			VERCEL_SANDBOX_TEAM_ID: "team_1",
		}),
	).toEqual(["VERCEL_SANDBOX_TOKEN", "VERCEL_SANDBOX_PROJECT_ID"]);
});
