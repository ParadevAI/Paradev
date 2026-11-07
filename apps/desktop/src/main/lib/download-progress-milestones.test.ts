import { describe, expect, test } from "bun:test";
import { createDownloadProgressMilestones } from "./download-progress-milestones";

describe("createDownloadProgressMilestones", () => {
	test("logs once per crossed milestone", () => {
		const milestones = createDownloadProgressMilestones();
		const logged = [1, 24.9, 25, 30, 49, 80, 99, 100, 100].filter((percent) =>
			milestones.shouldLog(percent),
		);
		expect(logged).toEqual([25, 80, 100]);
	});

	test("starts again after reset", () => {
		const milestones = createDownloadProgressMilestones();
		expect(milestones.shouldLog(100)).toBe(true);
		expect(milestones.shouldLog(100)).toBe(false);
		milestones.reset();
		expect(milestones.shouldLog(26)).toBe(true);
	});
});
