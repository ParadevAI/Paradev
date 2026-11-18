import { describe, expect, test } from "bun:test";
import { orphanCandidates, type SweepHost, sweepDrives } from "./drive-sweep";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const old = NOW - 10 * DAY;

describe("orphanCandidates", () => {
	test("any row that names a drive keeps it, whatever its status or age", () => {
		const candidates = orphanCandidates({
			drives: [
				{ name: "drive-ws-archived-long-ago", createdAt: old },
				{ name: "drive-ws-unnamed", createdAt: old },
				{ name: "drive-ws-young", createdAt: NOW - DAY / 2 },
				{ name: "drive-ws-held", createdAt: old, attachedTo: "box" },
				{ name: "env-drive-archived-env", createdAt: old },
				{ name: "env-drive-gone", createdAt: old },
				{ name: "agent-tools-iad1-feedfacecafe", createdAt: old },
			],
			named: new Set(["drive-ws-archived-long-ago", "env-drive-archived-env"]),
			now: NOW,
			minAgeMs: 2 * DAY,
		});
		expect(candidates.map((drive) => drive.name)).toEqual([
			"drive-ws-unnamed",
			"env-drive-gone",
		]);
	});
});

describe("sweepDrives", () => {
	test("a drive an unarchive named after the listing is kept: each delete checks again", async () => {
		const deleted: string[] = [];
		let named = new Set<string>();
		const host: SweepHost = {
			listDrives: async () => [
				{ name: "drive-ws-a", createdAt: old },
				{ name: "drive-ws-b", createdAt: old },
			],
			namedDrives: async () => {
				const listedAt = named;
				// The user unarchives workspace a right after the listing.
				named = new Set(["drive-ws-a"]);
				return listedAt;
			},
			stillOrphaned: async (name) => !named.has(name),
			remove: async (name) => {
				deleted.push(name);
			},
		};
		const result = await sweepDrives({
			host,
			now: NOW,
			minAgeMs: 2 * DAY,
			remove: true,
			log: () => {},
		});
		expect(deleted).toEqual(["drive-ws-b"]);
		expect(result).toEqual({ candidates: 2, deleted: 1, failed: 0 });
	});

	test("a dry run deletes nothing", async () => {
		const deleted: string[] = [];
		await sweepDrives({
			host: {
				listDrives: async () => [{ name: "drive-ws-a", createdAt: old }],
				namedDrives: async () => new Set(),
				stillOrphaned: async () => true,
				remove: async (name) => {
					deleted.push(name);
				},
			},
			now: NOW,
			minAgeMs: 2 * DAY,
			remove: false,
			log: () => {},
		});
		expect(deleted).toEqual([]);
	});
});
