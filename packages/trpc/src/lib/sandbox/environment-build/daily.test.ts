import { beforeEach, describe, expect, test } from "bun:test";
import { stub } from "../../../../test/stub";
import * as start from "./start";
import * as store from "./store";

let environments: Array<{ id: string; organizationId: string }>;
let finished: Array<{ status: "running" | "succeeded" | "failed" }>;
let refusal: start.BuildRefused | null;
let started: string[];

stub(store, {
	activeEnvironments: async () => environments,
	finishedBuilds: async () => finished,
});
stub(start, {
	organizationMayBuild: async (organizationId: string) =>
		organizationId === "org-paid",
	startEnvironmentBuild: async ({
		environmentId,
	}: {
		environmentId: string;
	}) => {
		if (refusal && environmentId === "a") throw refusal;
		started.push(environmentId);
	},
});

const { queueDailyBuilds } = await import("./daily");

beforeEach(() => {
	environments = [
		{ id: "paid", organizationId: "org-paid" },
		{ id: "free", organizationId: "org-free" },
	];
	finished = [];
	refusal = null;
	started = [];
});

describe("queueDailyBuilds", () => {
	test("builds paid environments and skips free ones", async () => {
		expect(await queueDailyBuilds()).toEqual({
			queued: 1,
			skipped: { "not-paid": 1 },
			failed: 0,
		});
		expect(started).toEqual(["paid"]);
	});

	test("skips an environment whose last three builds failed", async () => {
		finished = [
			{ status: "failed" },
			{ status: "failed" },
			{ status: "failed" },
		];
		expect((await queueDailyBuilds()).skipped.paused).toBe(1);
		expect(started).toEqual([]);
	});

	test("counts a refusal by its reason and keeps going", async () => {
		environments = [
			{ id: "a", organizationId: "org-paid" },
			{ id: "b", organizationId: "org-paid" },
		];
		refusal = new start.BuildRefused("no-install", "no install");
		expect(await queueDailyBuilds()).toEqual({
			queued: 1,
			skipped: { "no-install": 1 },
			failed: 0,
		});
	});
});
