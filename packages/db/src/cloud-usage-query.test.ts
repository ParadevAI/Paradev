import { beforeAll, describe, expect, test } from "bun:test";
import {
	BILLING_PAGE,
	BROKEN,
	CHECKOUT,
	MAYA,
	NOVEMBER,
	NOW,
	OCTOBER,
	ORG,
	RATE,
	SAM,
	seedCloudUsage,
} from "../test/cloud-usage-fixture";
import {
	cloudBillingPeriod,
	cloudBillingPeriodIndex,
	listCloudBoots,
	queryCloudUsage,
	queryCloudUsageByPeriod,
} from "./cloud-usage-query";

let db: Awaited<ReturnType<typeof seedCloudUsage>>;

beforeAll(async () => {
	db = await seedCloudUsage();
});

const usage = (
	options: Partial<Parameters<typeof queryCloudUsage>[2]>,
	userId?: string,
) =>
	queryCloudUsage(
		db,
		{ organizationId: ORG, userId },
		{ window: NOVEMBER, limit: 25, overagePerGbHour: RATE, ...options },
	);

const boots = (
	options: Partial<Parameters<typeof listCloudBoots>[2]>,
	userId?: string,
) =>
	listCloudBoots(
		db,
		{ organizationId: ORG, userId },
		{
			window: NOVEMBER,
			limit: 25,
			now: NOW,
			overagePerGbHour: RATE,
			...options,
		},
	);

describe("queryCloudUsage", () => {
	test("totals sent events and started boots in the window, and nothing of another organization", async () => {
		expect(await usage({})).toEqual({
			items: [],
			total: {
				workspaces: 3,
				boots: 4,
				failedBoots: 1,
				hours: 3.25,
				gbHours: 34,
				usageUsd: 2.04,
			},
			nextCursor: null,
		});
	});

	test("groups by user, by UTC day of sent_at, and by workspace", async () => {
		const brief = async (groupBy: "user" | "day" | "workspace") =>
			(await usage({ groupBy })).items.map((item) => [
				item.label,
				item.gbHours,
				item.boots,
				item.failedBoots,
				item.workspaces,
			]);
		expect(await brief("user")).toEqual([
			["Maya", 18, 3, 1, 2],
			["Sam", 16, 1, 0, 1],
		]);
		expect(await brief("day")).toEqual([
			["2026-11-17", 0, 1, 0, 1],
			["2026-11-16", 0, 0, 0, 1],
			["2026-11-12", 0, 2, 1, 1],
			["2026-11-10", 18, 1, 0, 1],
			["2026-11-01", 16, 0, 0, 1],
		]);
		expect(await brief("workspace")).toEqual([
			["fix-flaky-checkout", 18, 3, 1, 1],
			["billing-page", 16, 1, 0, 1],
			["broken-env", 0, 0, 0, 1],
		]);
	});

	test("a workspace that failed with no boot appears with its failure", async () => {
		const { items } = await usage({
			groupBy: "workspace",
			filters: { workspace: BROKEN },
		});
		expect(items.map((item) => item.ref)).toEqual([
			{
				id: BROKEN,
				name: "broken-env",
				status: "failed",
				size: "large",
				owner: { id: MAYA, name: "Maya", email: "Maya@example.com" },
				failure: {
					reason: "snapshot_expired",
					at: new Date("2026-11-16T14:03:00Z"),
				},
			},
		]);
	});

	test("an event sent at the window's end belongs to the next window", async () => {
		expect((await usage({ window: OCTOBER })).total.gbHours).toBe(16);
		expect((await usage({ filters: { user: SAM } })).total.gbHours).toBe(16);
	});
});

test("usage by period in one query matches each period's total", async () => {
	const periods = [
		NOVEMBER,
		OCTOBER,
		{ from: new Date("2026-09-01T00:00:00Z"), to: OCTOBER.from },
	];
	expect(
		await queryCloudUsageByPeriod(
			db,
			{ organizationId: ORG },
			{ periods, overagePerGbHour: RATE },
		),
	).toEqual(
		await Promise.all(
			periods.map(async (window) => ({
				...window,
				metrics: (await usage({ window })).total,
			})),
		),
	);
	const [own] = await queryCloudUsageByPeriod(
		db,
		{ organizationId: ORG, userId: SAM },
		{ periods: [NOVEMBER], overagePerGbHour: RATE },
	);
	expect(own?.metrics).toEqual((await usage({}, SAM)).total);
});

describe("listCloudBoots", () => {
	test("lists boots newest first; failed, released and open boots have only sent usage", async () => {
		const { items } = await boots({});
		expect(
			items.map((b) => [b.id, b.endReason, b.gbHours, b.usageUsd, b.minutes]),
		).toEqual([
			["boot_4", null, 0, 0, 960],
			["boot_6", "released", 0, 0, 5],
			["boot_2", "failed", 0, 0, 1],
			["boot_1", "idle", 18, 1.08, 135],
		]);
		expect(items[3]).toMatchObject({
			workspace: { id: CHECKOUT, name: "fix-flaky-checkout" },
			user: { id: MAYA, name: "Maya" },
			size: "medium",
			memoryGb: 8,
		});
		const failed = await boots({ endReason: ["failed"], open: false });
		expect(failed.items.map((b) => b.id)).toEqual(["boot_2"]);
	});
});

test("a member gets only their own rows", async () => {
	const own = await usage({ groupBy: "workspace" }, SAM);
	expect(own.items.map((item) => item.key)).toEqual([BILLING_PAGE]);
	expect(own.total).toMatchObject({ gbHours: 16, boots: 1 });
	const ownBoots = await boots({}, MAYA);
	expect(ownBoots.items.map((b) => b.id)).toEqual([
		"boot_6",
		"boot_2",
		"boot_1",
	]);
});

test("paging one row at a time returns every row once, in order", async () => {
	async function pages<Item, Cursor>(
		fetch: (cursor?: Cursor) => Promise<{
			items: Item[];
			nextCursor: Cursor | null;
		}>,
	) {
		const all: Item[] = [];
		let cursor: Cursor | undefined;
		for (let calls = 0; calls < 10; calls++) {
			const page = await fetch(cursor);
			all.push(...page.items);
			if (!page.nextCursor) break;
			cursor = page.nextCursor;
		}
		return all;
	}
	for (const groupBy of ["workspace", "day"] as const) {
		expect(
			await pages((cursor) => usage({ groupBy, limit: 1, cursor })),
		).toEqual((await usage({ groupBy })).items);
	}
	expect(await pages((cursor) => boots({ limit: 1, cursor }))).toEqual(
		(await boots({})).items,
	);
});

test("billing periods keep Autumn's reset day through short months", () => {
	const anchor = {
		resetsAt: new Date("2026-02-28T05:00:00Z"),
		previousResetAt: new Date("2026-01-31T05:00:00Z"),
	};
	expect(cloudBillingPeriod(anchor, 0)).toEqual({
		from: anchor.previousResetAt,
		to: anchor.resetsAt,
	});
	expect(cloudBillingPeriod(anchor, 1).from).toEqual(
		new Date("2025-12-31T05:00:00Z"),
	);
	expect(cloudBillingPeriodIndex(anchor, "2025-12-31")).toBe(1);
	expect(cloudBillingPeriodIndex(anchor, "2026-01-28")).toBeNull();
	const thirtieth = {
		resetsAt: new Date("2026-11-30T05:00:00Z"),
		previousResetAt: new Date("2026-10-30T05:00:00Z"),
	};
	expect(cloudBillingPeriod(thirtieth, 1).from).toEqual(
		new Date("2026-09-30T05:00:00Z"),
	);
});
