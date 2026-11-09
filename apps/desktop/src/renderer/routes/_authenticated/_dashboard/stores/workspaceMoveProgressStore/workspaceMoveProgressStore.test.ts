import { describe, expect, it } from "bun:test";
import {
	progressPercent,
	type WorkspaceMoveProgress,
} from "./workspaceMoveProgressStore";

const move: WorkspaceMoveProgress = {
	id: "m1",
	name: "Workspace",
	destination: "Cloud",
	stage: "moving-chats",
	chats: { total: 4, ready: 1, failed: 1 },
	error: null,
	failedDuring: null,
	retry: null,
	cancel: null,
};

describe("progressPercent", () => {
	it("counts a chat that failed as done, so the bar still reaches the end", () => {
		expect(progressPercent(move)).toBe(75);
		expect(
			progressPercent({ ...move, chats: { total: 4, ready: 3, failed: 1 } }),
		).toBe(100);
		expect(progressPercent({ ...move, stage: "saving" })).toBe(10);
	});
});
