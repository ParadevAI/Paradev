import { describe, expect, test } from "bun:test";
import { orphanDrives } from "./drive-sweep";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const old = NOW - 10 * DAY;

describe("orphanDrives", () => {
	test("only an old, detached drive that no workspace or live environment names", () => {
		const orphans = orphanDrives({
			drives: [
				{ name: "drive-ws-live", createdAt: old },
				{ name: "drive-ws-grace", createdAt: old },
				{ name: "drive-ws-reaped", createdAt: old },
				{ name: "drive-ws-unnamed", createdAt: old },
				{ name: "drive-ws-young", createdAt: NOW - DAY / 2 },
				{ name: "drive-ws-held", createdAt: old, attachedTo: "box" },
				{ name: "env-drive-live", createdAt: old },
				{ name: "env-drive-gone", createdAt: old },
				{ name: "agent-tools-iad1-feedfacecafe", createdAt: old },
			],
			owners: {
				workspaces: [
					{ driveName: "drive-ws-live", status: "asleep", deletedAt: null },
					{
						driveName: "drive-ws-grace",
						status: "archived",
						deletedAt: new Date(NOW - 3 * DAY),
					},
					{
						driveName: "drive-ws-reaped",
						status: "archived",
						deletedAt: new Date(NOW - 9 * DAY),
					},
				],
				liveGoldens: ["env-drive-live"],
			},
			now: NOW,
			minAgeMs: 2 * DAY,
		});
		expect(orphans.map((drive) => drive.name)).toEqual([
			"drive-ws-reaped",
			"drive-ws-unnamed",
			"env-drive-gone",
		]);
	});
});
