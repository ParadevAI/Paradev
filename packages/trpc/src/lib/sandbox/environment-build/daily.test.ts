import { beforeEach, describe, expect, test } from "bun:test";
import { stub } from "../../../../test/stub";
import * as jobs from "../../../router/cloud-workspace/jobs";
import { DAILY_BUILD_WINDOW_MS } from "./limits";
import * as start from "./start";
import * as store from "./store";

let environments: Array<{ id: string; organizationId: string }>;
let finished: Array<{ status: "running" | "succeeded" | "failed" }>;
let published: Array<{
	body: unknown;
	delaySeconds?: number;
	deduplicationId?: string;
}>;

stub(store, {
	activeEnvironments: async () => environments,
	finishedBuilds: async () => finished,
});
stub(start, {
	organizationMayBuild: async (organizationId: string) =>
		organizationId === "org-paid",
	startEnvironmentBuild: async () => {
		throw new start.BuildRefused("no-install", "no install");
	},
});
stub(jobs, {
	publishCloudWorkspaceJob: async (job: (typeof published)[number]) => {
		published.push(job);
	},
});

const { dailyBuildDelaySeconds, queueDailyBuilds, runDailyBuild } =
	await import("./daily");

const DAY = new Date("2026-11-23T09:00:00Z");

beforeEach(() => {
	environments = [
		{ id: "paid", organizationId: "org-paid" },
		{ id: "free", organizationId: "org-free" },
	];
	finished = [];
	published = [];
});

describe("queueDailyBuilds", () => {
	test("queues one job per paid environment, at its own offset, once a day", async () => {
		expect(await queueDailyBuilds(DAY)).toEqual({
			queued: 1,
			skipped: { "not-paid": 1 },
		});
		expect(published).toEqual([
			expect.objectContaining({
				body: { environmentId: "paid" },
				delaySeconds: dailyBuildDelaySeconds("paid"),
				deduplicationId: "environment-daily-build-paid-2026-11-23",
			}),
		]);
	});

	test("skips an environment whose last three builds failed", async () => {
		finished = [
			{ status: "failed" },
			{ status: "failed" },
			{ status: "failed" },
		];
		expect((await queueDailyBuilds(DAY)).skipped.paused).toBe(1);
		expect(published).toEqual([]);
	});
});

describe("dailyBuildDelaySeconds", () => {
	test("is the same every day and spreads environments over the window", () => {
		const windowSeconds = DAILY_BUILD_WINDOW_MS / 1000;
		const delays = Array.from({ length: 400 }, (_, index) =>
			dailyBuildDelaySeconds(`environment-${index}`),
		);
		expect(dailyBuildDelaySeconds("environment-7")).toBe(delays[7] ?? -1);
		expect(delays.every((delay) => delay >= 0 && delay < windowSeconds)).toBe(
			true,
		);
		const quarters = [0, 1, 2, 3].map(
			(quarter) =>
				delays.filter(
					(delay) => Math.floor((delay / windowSeconds) * 4) === quarter,
				).length,
		);
		expect(Math.min(...quarters)).toBeGreaterThan(70);
	});
});

describe("runDailyBuild", () => {
	test("reports a refusal instead of failing, so the job is not retried", async () => {
		expect(await runDailyBuild("paid")).toEqual({ refused: "no-install" });
	});
});
