import { describe, expect, test } from "bun:test";
import { layoutLanes } from "./dayLayout";

describe("layoutLanes", () => {
	test("blocks that overlap share the width; one after them takes it all", () => {
		const lanes = layoutLanes([
			{ id: "standup", from: 570, to: 615 },
			{ id: "planning", from: 630, to: 690 },
			{ id: "dentist", from: 630, to: 675 },
			{ id: "lunch", from: 720, to: 780 },
		]);
		expect(lanes.map((l) => [l.id, l.lane, l.lanes])).toEqual([
			["standup", 0, 1],
			["planning", 0, 2],
			["dentist", 1, 2],
			["lunch", 0, 1],
		]);
	});

	test("a lane is reused once its block ends", () => {
		const lanes = layoutLanes([
			{ id: "a", from: 0, to: 120 },
			{ id: "b", from: 30, to: 60 },
			{ id: "c", from: 60, to: 90 },
		]);
		expect(lanes.map((l) => [l.id, l.lane, l.lanes])).toEqual([
			["a", 0, 2],
			["b", 1, 2],
			["c", 1, 2],
		]);
	});
});
