import { describe, expect, it } from "bun:test";
import { contextWindow, contextWindowLevel } from "./contextWindow";

describe("contextWindowLevel", () => {
	it("stays neutral below 75%, warns to 90%, and is critical above", () => {
		expect(
			[74.9, 75, 90, 90.1].map((percent) => contextWindowLevel(percent)),
		).toEqual(["normal", "warning", "warning", "critical"]);
	});
});

describe("contextWindow", () => {
	it("formats the share used, the token counts and the session cost", () => {
		expect(
			contextWindow({
				contextUsed: 84_000,
				contextSize: 200_000,
				costUsd: 0.4231,
			}),
		).toMatchObject({
			usedPercent: 42,
			percent: "42%",
			used: "84K",
			size: "200K",
			remaining: "116K",
			cost: "$0.42",
		});
	});

	it("caps an overfull window at 100% with nothing left", () => {
		expect(
			contextWindow({ contextUsed: 1_050_000, contextSize: 1_000_000 }),
		).toMatchObject({ usedPercent: 100, remaining: "0", cost: null });
	});
});
