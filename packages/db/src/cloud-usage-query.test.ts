import { beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import {
	getTableConfig,
	isPgEnum,
	isPgSchema,
	type PgTable,
} from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import {
	cloudBillingPeriod,
	cloudBillingPeriodIndex,
	listCloudBoots,
	queryCloudUsage,
} from "./cloud-usage-query";
import * as schema from "./schema";

const ORG = "a0000000-0000-4000-8000-000000000001";
const OTHER_ORG = "a0000000-0000-4000-8000-000000000002";
const MAYA = "b0000000-0000-4000-8000-000000000001";
const SAM = "b0000000-0000-4000-8000-000000000002";
const BEN = "b0000000-0000-4000-8000-000000000003";
const CHECKOUT = "c0000000-0000-4000-8000-000000000001";
const BILLING_PAGE = "c0000000-0000-4000-8000-000000000002";
const BROKEN = "c0000000-0000-4000-8000-000000000003";
const OTHER_WS = "c0000000-0000-4000-8000-000000000004";

const NOW = new Date("2026-11-18T00:00:00Z");
const OCTOBER = {
	from: new Date("2026-10-01T00:00:00Z"),
	to: new Date("2026-11-01T00:00:00Z"),
};
const NOVEMBER = { from: OCTOBER.to, to: new Date("2026-12-01T00:00:00Z") };
const RATE = 0.06;

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	const tables = new Set<PgTable>();
	const withParents = (table: PgTable) => {
		if (tables.has(table)) return;
		tables.add(table);
		for (const key of getTableConfig(table).foreignKeys) {
			withParents(key.reference().foreignTable);
		}
	};
	withParents(schema.cloudUsageEvents);
	withParents(schema.users);
	const types = Object.values(schema).filter(
		(value) => isPgEnum(value) || isPgSchema(value),
	);
	const ddl = await generateMigration(
		generateDrizzleJson({}),
		generateDrizzleJson(
			Object.fromEntries([...types, ...tables].map((value, i) => [i, value])),
			undefined,
			undefined,
			"snake_case",
		),
	);
	const client = new PGlite();
	await client.exec(ddl.join(";\n"));
	db = drizzle({ client, casing: "snake_case" });

	await db.insert(schema.organizations).values([
		{ id: ORG, name: "Northwind", slug: "northwind" },
		{ id: OTHER_ORG, name: "Other", slug: "other" },
	]);
	await db.insert(schema.users).values(
		[
			[MAYA, "Maya"],
			[SAM, "Sam"],
			[BEN, "Ben"],
		].map(([id, name]) => ({ id, name, email: `${name}@example.com` })),
	);
	const [env, otherEnv] = await db
		.insert(schema.environments)
		.values(
			[ORG, OTHER_ORG].map((organizationId) => ({
				organizationId,
				name: "env",
				sourceKind: "image" as const,
				sourceRef: "img",
				bundleSha: "sha",
			})),
		)
		.returning();
	if (!env || !otherEnv) throw new Error("no environments");
	const workspace = (
		id: string,
		name: string,
		createdByUserId: string,
		organizationId = ORG,
		environmentId = env.id,
	) => ({
		id,
		name,
		createdByUserId,
		organizationId,
		environmentId,
		branch: "main",
		baseBranch: "main",
		providerSandboxId: `sbx-${id}`,
	});
	await db.insert(schema.cloudWorkspaces).values([
		{
			...workspace(CHECKOUT, "fix-flaky-checkout", MAYA),
			status: "asleep",
			machineSize: "medium",
		},
		{ ...workspace(BILLING_PAGE, "billing-page", SAM), status: "awake" },
		{
			...workspace(BROKEN, "broken-env", MAYA),
			status: "failed",
			failureReason: "snapshot_expired",
			failedAt: new Date("2026-11-16T14:03:00Z"),
		},
		workspace(OTHER_WS, "other", BEN, OTHER_ORG, otherEnv.id),
	]);
	await db.insert(schema.cloudWorkspaceBoots).values(
		(
			[
				[
					"boot_1",
					CHECKOUT,
					MAYA,
					4,
					"2026-11-10T09:00Z",
					"2026-11-10T11:15Z",
					"idle",
				],
				[
					"boot_2",
					CHECKOUT,
					MAYA,
					4,
					"2026-11-12T08:00Z",
					"2026-11-12T08:01Z",
					"failed",
				],
				[
					"boot_3",
					BILLING_PAGE,
					SAM,
					8,
					"2026-10-31T23:00Z",
					"2026-11-01T01:00Z",
					"user",
				],
				["boot_4", BILLING_PAGE, SAM, 8, "2026-11-17T08:00Z", null, null],
				[
					"boot_6",
					CHECKOUT,
					MAYA,
					4,
					"2026-11-12T08:00Z",
					"2026-11-12T08:05Z",
					"released",
				],
				[
					"boot_5",
					OTHER_WS,
					BEN,
					4,
					"2026-11-10T09:00Z",
					"2026-11-10T10:00Z",
					"idle",
				],
			] as const
		).map(
			([
				id,
				cloudWorkspaceId,
				createdByUserId,
				vcpus,
				startedAt,
				stoppedAt,
				endReason,
			]) => ({
				id,
				organizationId: cloudWorkspaceId === OTHER_WS ? OTHER_ORG : ORG,
				cloudWorkspaceId,
				createdByUserId,
				vcpus,
				memoryMb: vcpus * 2048,
				startedAt: new Date(startedAt),
				stoppedAt: stoppedAt && new Date(stoppedAt),
				endReason,
			}),
		),
	);
	await db.insert(schema.cloudUsageEvents).values(
		(
			[
				[
					"boot_1",
					1,
					CHECKOUT,
					MAYA,
					"2026-11-10T09:00Z",
					"2026-11-10T10:00Z",
					480,
					"2026-11-10T10:05Z",
				],
				[
					"boot_1",
					2,
					CHECKOUT,
					MAYA,
					"2026-11-10T10:00Z",
					"2026-11-10T11:15Z",
					600,
					"2026-11-10T11:20Z",
				],
				[
					"boot_3",
					1,
					BILLING_PAGE,
					SAM,
					"2026-10-31T23:00Z",
					"2026-11-01T00:00Z",
					960,
					"2026-10-31T23:59:59.999Z",
				],
				[
					"boot_3",
					2,
					BILLING_PAGE,
					SAM,
					"2026-11-01T00:00Z",
					"2026-11-01T01:00Z",
					960,
					"2026-11-01T00:00Z",
				],
				[
					"boot_4",
					1,
					BILLING_PAGE,
					SAM,
					"2026-11-17T08:00Z",
					"2026-11-17T09:00Z",
					960,
					null,
				],
				[
					"boot_5",
					1,
					OTHER_WS,
					BEN,
					"2026-11-10T09:00Z",
					"2026-11-10T10:00Z",
					100,
					"2026-11-10T10:05Z",
				],
			] as const
		).map(
			([
				bootId,
				lockSeq,
				cloudWorkspaceId,
				userId,
				windowFrom,
				windowTo,
				amount,
				sentAt,
			]) => ({
				bootId,
				lockSeq,
				feature: "box_gb_minutes" as const,
				organizationId: cloudWorkspaceId === OTHER_WS ? OTHER_ORG : ORG,
				cloudWorkspaceId,
				userId,
				windowFrom: new Date(windowFrom),
				windowTo: new Date(windowTo),
				amount: String(amount),
				sentAt: sentAt && new Date(sentAt),
			}),
		),
	);
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
