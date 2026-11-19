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
	cloudBillingAnchor,
	cloudBillingPeriod,
	cloudBillingPeriodIndex,
	getFleetCloudBoot,
	listCloudBoots,
	listFleetCloudBoots,
	queryCloudUsage,
	queryCloudUsageByPeriod,
	queryFleetCloudUsage,
} from "./cloud-usage-query";
import {
	cloudUsageEvents,
	cloudWorkspaceBoots,
	cloudWorkspaces,
	taskProjects,
} from "./schema";

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
			rowCount: 0,
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
				lastBoot: null,
			},
		]);
	});

	test("a workspace carries its newest boot's end reason and stop, null while it runs", async () => {
		const { items } = await usage({ groupBy: "workspace" });
		expect(
			items.map((item) => [
				item.key,
				item.ref && "lastBoot" in item.ref ? item.ref.lastBoot : undefined,
			]),
		).toEqual([
			[
				CHECKOUT,
				{ endReason: "released", stoppedAt: new Date("2026-11-12T08:05Z") },
			],
			[
				BILLING_PAGE,
				{ endReason: "user", stoppedAt: new Date("2026-12-05T09:00Z") },
			],
			[BROKEN, null],
		]);
		const { items: own } = await usage(
			{ groupBy: "workspace", filters: { workspace: BILLING_PAGE } },
			SAM,
		);
		expect(
			own.map((item) =>
				item.ref && "lastBoot" in item.ref ? item.ref.lastBoot : undefined,
			),
		).toEqual([{ endReason: null, stoppedAt: null }]);
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

test("a search matches workspace names, any case, and its wildcards are text", async () => {
	const keys = async (search: string) =>
		(await usage({ groupBy: "workspace", filters: { search } })).items.map(
			(item) => item.key,
		);
	expect(await keys("CHECK")).toEqual([CHECKOUT]);
	expect(await keys("-")).toEqual([CHECKOUT, BILLING_PAGE, BROKEN]);
	expect(await keys("%")).toEqual([]);
});

test.each([
	["gbHours", "desc", [CHECKOUT, BILLING_PAGE, BROKEN]],
	["hours", "asc", [BROKEN, BILLING_PAGE, CHECKOUT]],
	["boots", "desc", [CHECKOUT, BILLING_PAGE, BROKEN]],
	["name", "asc", [BILLING_PAGE, BROKEN, CHECKOUT]],
	["name", "desc", [CHECKOUT, BROKEN, BILLING_PAGE]],
	["status", "asc", [BROKEN, BILLING_PAGE, CHECKOUT]],
] as const)("sorted by %s %s, pages of one row give the same rows", async (by, order, expected) => {
	const sort = { by, order };
	const all = await usage({ groupBy: "workspace", sort });
	expect(all.items.map((item) => item.key)).toEqual([...expected]);
	const paged: typeof all.items = [];
	let cursor: (typeof all)["nextCursor"] | undefined;
	do {
		const page = await usage({ groupBy: "workspace", sort, limit: 1, cursor });
		paged.push(...page.items);
		cursor = page.nextCursor;
	} while (cursor && paged.length < 10);
	expect(paged).toEqual(all.items);
});

test("rowCount is every row of the filter, on every page", async () => {
	const first = await usage({ groupBy: "workspace", limit: 1 });
	expect(first.rowCount).toBe(3);
	const second = await usage({
		groupBy: "workspace",
		limit: 1,
		cursor: first.nextCursor ?? undefined,
	});
	expect(second.rowCount).toBe(3);
	expect(
		(await usage({ groupBy: "workspace", filters: { status: ["failed"] } }))
			.rowCount,
	).toBe(1);
});

test("rowCount counts the row of usage with no workspace, which total.workspaces does not", async () => {
	const window = {
		from: new Date("2026-12-10T00:00:00Z"),
		to: new Date("2026-12-20T00:00:00Z"),
	};
	await db.insert(cloudUsageEvents).values({
		bootId: "boot_7",
		lockSeq: 9,
		feature: "box_gb_minutes",
		organizationId: ORG,
		cloudWorkspaceId: null,
		userId: MAYA,
		windowFrom: new Date("2026-12-15T00:00:00Z"),
		windowTo: new Date("2026-12-15T01:00:00Z"),
		amount: "60",
		sentAt: new Date("2026-12-15T01:00:00Z"),
	});
	try {
		const result = await usage({ window, groupBy: "workspace" });
		expect(result.items.map((item) => item.key)).toEqual([null]);
		expect(result.rowCount).toBe(1);
		expect(result.total.workspaces).toBe(0);
	} finally {
		await db.delete(cloudUsageEvents).where(eq(cloudUsageEvents.lockSeq, 9));
	}
});

test.each([
	[
		"the 31st, ending in a 30-day month",
		"2026-08-31T05:00:00.000Z",
		"2026-11-30",
		"2026-10-31",
	],
	[
		"the 30th, ending in February",
		"2026-12-30T05:00:00.000Z",
		"2027-02-28",
		"2027-01-30",
	],
	[
		"the 29th, ending on a leap day",
		"2027-12-29T05:00:00.000Z",
		"2028-02-29",
		"2028-01-29",
	],
	["the 15th", "2026-03-15T05:00:00.000Z", "2026-11-15", "2026-10-15"],
	[
		"the 31st, on a yearly plan",
		"2026-01-31T05:00:00.000Z",
		"2026-11-30",
		"2026-10-31",
	],
	[
		"the 28th, after a plan change on the 30th",
		"2027-01-30T14:22:05.123Z",
		"2027-02-28",
		"2027-01-28",
	],
	[
		"the 30th, after a plan change on the 10th",
		"2026-11-10T09:00:00.000Z",
		"2026-11-30",
		"2026-10-30",
	],
])("billing periods reset on %s", (_, startedAt, resetDay, periodStart) => {
	const anchor = cloudBillingAnchor(
		new Date(`${resetDay}T05:00:00.000Z`),
		new Date(startedAt),
	);
	expect(cloudBillingPeriod(anchor, 0)).toEqual({
		from: new Date(`${periodStart}T05:00:00.000Z`),
		to: anchor.resetsAt,
	});
	expect(cloudBillingPeriodIndex(anchor, periodStart)).toBe(0);
});

describe("fleet scope", () => {
	const fleet = (
		options: Partial<Parameters<typeof queryFleetCloudUsage>[2]>,
		organizationId: string | string[] | null = null,
	) =>
		queryFleetCloudUsage(db, organizationId, {
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

	test("a list of workspaces and a skip of the name lookup serve one page of a list", async () => {
		const page = await fleet({
			groupBy: "workspace",
			filters: { workspace: [CHECKOUT, BROKEN] },
			refs: false,
		});
		expect(
			page.items.map((item) => [item.key, item.label, item.ref, item.boots]),
		).toEqual([
			[CHECKOUT, null, null, 3],
			[BROKEN, null, null, 0],
		]);
		const bySize = await fleet({ groupBy: "size", refs: false });
		expect(bySize.items.map((item) => item.label)).toEqual(["medium", "large"]);
		expect(
			(await fleet({ filters: { workspace: [CHECKOUT, BROKEN] } })).total
				.workspaces,
		).toBe(2);
	});

	test("a list of organizations, and the project filter", async () => {
		expect((await fleet({}, [ORG, OTHER_ORG])).total).toEqual(
			(await fleet({})).total,
		);
		expect((await fleet({}, [OTHER_ORG])).total.boots).toBe(1);
		expect((await fleet({}, [])).total.boots).toBe(0);
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
			const inProject = await fleet({ filters: { project: project.id } });
			expect(inProject.total).toMatchObject({ boots: 3, workspaces: 1 });
			const listed = await listFleetCloudBoots(db, null, {
				window: NOVEMBER,
				filters: { project: project.id },
				limit: 25,
				now: NOW,
				overagePerGbHour: RATE,
			});
			expect(listed.items.map((boot) => boot.id)).toEqual([
				"boot_6",
				"boot_2",
				"boot_1",
			]);
		} finally {
			await db
				.update(cloudWorkspaces)
				.set({ projectId: null })
				.where(eq(cloudWorkspaces.id, CHECKOUT));
		}
	});

	test("one boot by id or session id, with its organization", async () => {
		const setSession = (vercelSessionId: string | null) =>
			db
				.update(cloudWorkspaceBoots)
				.set({ vercelSessionId })
				.where(eq(cloudWorkspaceBoots.id, "boot_5"));
		await setSession("sess_5");
		try {
			const options = { now: NOW, overagePerGbHour: RATE };
			const byId = await getFleetCloudBoot(db, "boot_5", options);
			expect(byId).toMatchObject({
				id: "boot_5",
				sessionId: "sess_5",
				organization: { id: OTHER_ORG },
				gbHours: 100 / 60,
			});
			expect((await getFleetCloudBoot(db, "sess_5", options))?.id).toBe(
				"boot_5",
			);
			expect(await getFleetCloudBoot(db, "boot_nope", options)).toBeNull();
		} finally {
			await setSession(null);
		}
	});

	test("phases, the trace id and the origin on the fleet reads, not on the customer list", async () => {
		const phases = [
			{ name: "claim", source: "api" as const, at: 1_789_000_000_000, ms: 400 },
			{
				name: "boot.start",
				source: "box" as const,
				at: 1_789_000_000_500,
				ms: 900,
			},
		];
		const setTrace = (trace: {
			phases: typeof phases | null;
			traceId: string | null;
			origin: "wake" | null;
		}) =>
			db
				.update(cloudWorkspaceBoots)
				.set(trace)
				.where(eq(cloudWorkspaceBoots.id, "boot_1"));
		await setTrace({ phases, traceId: "a".repeat(32), origin: "wake" });
		try {
			const options = { now: NOW, overagePerGbHour: RATE };
			const traced = { phases, traceId: "a".repeat(32), origin: "wake" };
			expect(await getFleetCloudBoot(db, "boot_1", options)).toMatchObject(
				traced,
			);
			const fleetList = await listFleetCloudBoots(db, ORG, {
				window: NOVEMBER,
				limit: 25,
				...options,
			});
			expect(
				fleetList.items.find((boot) => boot.id === "boot_1"),
			).toMatchObject(traced);
			const customer = (await boots({})).items.find(
				(boot) => boot.id === "boot_1",
			);
			expect(customer).toBeDefined();
			expect(customer).not.toHaveProperty("phases");
			expect(customer).not.toHaveProperty("traceId");
			expect(customer).not.toHaveProperty("origin");
		} finally {
			await setTrace({ phases: null, traceId: null, origin: null });
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
		const { items } = await listFleetCloudBoots(db, null, {
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
			origin: null,
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

	test("a customer scope reads only its own organization", async () => {
		const empty = await queryCloudUsage(
			db,
			{ organizationId: "a0000000-0000-4000-8000-0000000000ff" },
			{ window: NOVEMBER, limit: 1, overagePerGbHour: RATE },
		);
		expect(empty.total).toMatchObject({ boots: 0, workspaces: 0, gbHours: 0 });
		const others = await listCloudBoots(
			db,
			{ organizationId: OTHER_ORG },
			{ window: NOVEMBER, limit: 25, now: NOW, overagePerGbHour: RATE },
		);
		expect(others.items.map((boot) => boot.id)).toEqual(["boot_5"]);
	});
});
