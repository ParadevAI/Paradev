import { describe, expect, test } from "bun:test";
import { type DailyBuildDeps, queueDailyBuilds } from "./daily";
import { BuildRefused } from "./start";

function deps(overrides: Partial<DailyBuildDeps> = {}): DailyBuildDeps & {
	started: string[];
} {
	const started: string[] = [];
	return {
		started,
		environments: async () => [
			{ id: "paid", organizationId: "org-paid" },
			{ id: "free", organizationId: "org-free" },
		],
		recentFinished: async () => [],
		mayBuild: async (organizationId) => organizationId === "org-paid",
		start: async (environmentId) => {
			started.push(environmentId);
		},
		...overrides,
	};
}

describe("queueDailyBuilds", () => {
	test("builds paid environments and skips free ones", async () => {
		const run = deps();
		expect(await queueDailyBuilds(run)).toEqual({
			queued: 1,
			skipped: { "not-paid": 1 },
			failed: 0,
		});
		expect(run.started).toEqual(["paid"]);
	});

	test("skips an environment whose last three builds failed", async () => {
		const run = deps({
			recentFinished: async () => [
				{ status: "failed" },
				{ status: "failed" },
				{ status: "failed" },
			],
		});
		expect((await queueDailyBuilds(run)).skipped.paused).toBe(1);
		expect(run.started).toEqual([]);
	});

	test("counts a refusal by its reason and keeps going", async () => {
		const run = deps({
			environments: async () => [
				{ id: "a", organizationId: "org-paid" },
				{ id: "b", organizationId: "org-paid" },
			],
			start: async (environmentId) => {
				if (environmentId === "a") {
					throw new BuildRefused("no-install", "no install");
				}
			},
		});
		expect(await queueDailyBuilds(run)).toEqual({
			queued: 1,
			skipped: { "no-install": 1 },
			failed: 0,
		});
	});
});
