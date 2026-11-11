import { describe, expect, test } from "bun:test";
import { listMoveComputers } from "./listMoveComputers";

describe("listMoveComputers", () => {
	test("leaves out the source and cloud boxes, and puts online computers first", () => {
		expect(
			listMoveComputers({
				hosts: [
					{ machineId: "source", name: "Source", isOnline: true },
					{ machineId: "sleeping", name: "Sleeping", isOnline: false },
					{ machineId: "cloud-ws", name: "Cloud box", isOnline: true },
					{ machineId: "awake", name: "Awake", isOnline: true },
				],
				fromHostId: "source",
				cloudHostIds: new Set(["cloud-ws"]),
			}),
		).toEqual([
			{ hostId: "awake", name: "Awake", online: true },
			{ hostId: "sleeping", name: "Sleeping", online: false },
		]);
	});
});
