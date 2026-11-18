import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import {
	BEN,
	BILLING_PAGE,
	BROKEN,
	CHECKOUT,
	MAYA,
	NOVEMBER,
	NOW,
	OCTOBER,
	ORG,
	OTHER_ORG,
	OTHER_WS,
	RATE,
	SAM,
	seedCloudUsage,
} from "../test/cloud-usage-fixture";
import {
	type CloudFleetScope,
	cloudBillingPeriod,
	cloudBillingPeriodIndex,
	cloudFleetScope,
	listCloudBoots,
	queryCloudUsage,
	queryCloudUsageByPeriod,
} from "./cloud-usage-query";
import { cloudWorkspaces, taskProjects } from "./schema";

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

describe("fleet scope", () => {
	const fleet = (
		options: Partial<Parameters<typeof queryCloudUsage>[2]>,
		organizationId?: string,
	) =>
		queryCloudUsage(db, cloudFleetScope(organizationId), {
			window: NOVEMBER,
			limit: 25,
			overagePerGbHour: RATE,
			...options,
		});

	test("with no organization the total is every organization's, and one organization's matches the customer's", async () => {
		const all = await fleet({});
		expect(all.total).toMatchObject({
			boots: 5,
			gbHours: expect.closeTo(35.6667, 3),
		});
		expect((await fleet({}, ORG)).total).toEqual((await usage({})).total);
	});

	test("groups by organization, size, end reason and project", async () => {
		const brief = async (groupBy: Parameters<typeof fleet>[0]["groupBy"]) =>
			(await fleet({ groupBy })).items.map((item) => [
				item.key,
				item.label,
				item.boots,
				item.failedBoots,
				item.workspaces,
			]);
		expect(await brief("organization")).toEqual([
			[ORG, "Northwind", 4, 1, 3],
			[OTHER_ORG, "Other", 1, 0, 1],
		]);
		expect(await brief("size")).toEqual([
			["medium", "medium", 4, 1, 2],
			["large", "large", 1, 0, 2],
		]);
		expect(await brief("endReason")).toEqual([
			["idle", "idle", 2, 0, 2],
			["user", "user", 0, 0, 1],
			[null, null, 1, 0, 1],
			["failed", "failed", 1, 1, 2],
			["released", "released", 1, 0, 1],
		]);
		expect(await brief("project")).toEqual([[null, null, 5, 1, 4]]);
	});

	test("groups by project, named", async () => {
		const [project] = await db
			.insert(taskProjects)
			.values({ organizationId: ORG, name: "Checkout revamp" })
			.returning();
		if (!project) throw new Error("no project");
		await db
			.update(cloudWorkspaces)
			.set({ projectId: project.id })
			.where(eq(cloudWorkspaces.id, CHECKOUT));
		try {
			const { items } = await fleet({ groupBy: "project" });
			expect(
				items.map((item) => [item.label, item.boots, item.gbHours]),
			).toEqual([
				["Checkout revamp", 3, 18],
				[null, 2, 16 + 100 / 60],
			]);
		} finally {
			await db
				.update(cloudWorkspaces)
				.set({ projectId: null })
				.where(eq(cloudWorkspaces.id, CHECKOUT));
		}
	});

	test("a failed workspace counts the same way on every path", async () => {
		const failedWorkspaces = (result: { items: { workspaces: number }[] }) =>
			result.items.reduce((sum, item) => sum + item.workspaces, 0);
		const total = (await fleet({}, ORG)).total.workspaces;
		for (const groupBy of ["workspace", "size", "organization"] as const) {
			expect(failedWorkspaces(await fleet({ groupBy }, ORG)), groupBy).toBe(
				total,
			);
		}
		expect(total).toBe(3);
		const [byPeriod] = await queryCloudUsageByPeriod(
			db,
			{ organizationId: ORG },
			{ periods: [NOVEMBER], overagePerGbHour: RATE },
		);
		expect(byPeriod?.metrics.workspaces).toBe(total);
	});

	test("lists boots across organizations with CPU, egress and the organization", async () => {
		const { items } = await listCloudBoots(db, cloudFleetScope(), {
			window: NOVEMBER,
			limit: 25,
			now: NOW,
			overagePerGbHour: RATE,
		});
		expect(items.map((boot) => boot.id)).toEqual([
			"boot_4",
			"boot_6",
			"boot_2",
			"boot_5",
			"boot_1",
		]);
		expect(items.find((boot) => boot.id === "boot_5")).toMatchObject({
			organization: { id: OTHER_ORG, slug: "other" },
			workspace: { id: OTHER_WS },
			user: { id: BEN },
			activeCpuMinutes: null,
			egressGb: null,
		});
	});

	test("a customer's boots have no organization, CPU or egress fields", async () => {
		const { items } = await boots({});
		expect(items.length).toBeGreaterThan(0);
		for (const boot of items) {
			expect(Object.keys(boot)).not.toContain("organization");
			expect(Object.keys(boot)).not.toContain("activeCpuMinutes");
			expect(Object.keys(boot)).not.toContain("egressGb");
		}
	});

	test("a customer scope never reads another organization", async () => {
		const unknown = queryCloudUsage(
			db,
			{ organizationId: "" },
			{ window: NOVEMBER, limit: 1, overagePerGbHour: RATE },
		);
		await expect(unknown).rejects.toThrow();
	});

	test("a customer scope is not a fleet scope and cannot group by more", () => {
		// @ts-expect-error CloudUsageScope lacks the fleet brand
		const asFleet: CloudFleetScope = { organizationId: ORG };
		expect(asFleet.organizationId).toBe(ORG);
		const groupByOrganization = () =>
			queryCloudUsage(
				db,
				{ organizationId: ORG },
				{
					window: NOVEMBER,
					limit: 1,
					// @ts-expect-error a customer scope groups by user, day or workspace
					groupBy: "organization",
					overagePerGbHour: RATE,
				},
			);
		expect(groupByOrganization).toBeFunction();
	});
});
