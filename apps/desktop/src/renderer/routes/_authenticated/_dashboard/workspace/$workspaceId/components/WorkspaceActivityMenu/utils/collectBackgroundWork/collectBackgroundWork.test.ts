import { describe, expect, it } from "bun:test";
import { collectBackgroundWork } from "./collectBackgroundWork";

describe("collectBackgroundWork", () => {
	it("lists backgrounded terminals oldest first", () => {
		expect(
			collectBackgroundWork([
				{ terminalId: "late", title: "bun dev", createdAt: 2 },
				{ terminalId: "early", title: null, createdAt: 1 },
			]),
		).toEqual([
			{ key: "terminal:early", name: "", startedAtMs: 1, terminalId: "early" },
			{
				key: "terminal:late",
				name: "bun dev",
				startedAtMs: 2,
				terminalId: "late",
			},
		]);
	});
});
