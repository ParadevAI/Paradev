import { beforeAll, describe, expect, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import { drizzle } from "drizzle-orm/pglite";
import {
	type CloudBilling,
	CloudUsageInputError,
	listCloudBoots,
	listCloudPeriods,
	queryCloudUsage,
	resolveRange,
} from "./cloud-usage-query";
import {
	bootsResultSchema,
	periodsResultSchema,
	usageResultSchema,
} from "./cloud-usage-schemas";
import * as schema from "./schema";
import type { CloudWorkspaceBootEndReason } from "./schema/enums";

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
const NOVEMBER = {
	from: new Date("2026-11-01T00:00:00Z"),
	to: new Date("2026-12-01T00:00:00Z"),
};
const BILLING: CloudBilling = {
	includedGbHours: 7000,
	usedGbHours: 34,
	overageGbHours: 0,
	prepaidRemainingGbHours: 150,
	resetsAt: NOVEMBER.to,
	overagePerGbHour: 0.06,
};
const reader = { billing: async () => BILLING };
const RATE = BILLING.overagePerGbHour;

let db: ReturnType<typeof drizzle>;

beforeAll(async () => {
	const client = new PGlite({ extensions: { pg_trgm } });
	await client.exec("create extension pg_trgm");
	// chat_items has a generated column over a function that only a hand-written migration creates.
	const { chatItems: _, ...tables } = schema;
	const ddl = await generateMigration(
		generateDrizzleJson({}),
		generateDrizzleJson(tables, undefined, undefined, "snake_case"),
	);
	await client.exec(ddl.join(";\n"));
	db = drizzle({ client, casing: "snake_case" });

	await db.insert(schema.organizations).values([
		{ id: ORG, name: "Northwind", slug: "northwind" },
		{ id: OTHER_ORG, name: "Other", slug: "other" },
	]);
	await db.insert(schema.users).values([
		{ id: MAYA, name: "Maya", email: "maya@example.com" },
		{ id: SAM, name: "Sam", email: "sam@example.com" },
		{ id: BEN, name: "Ben", email: "ben@example.com" },
	]);
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
		organizationId: string,
		createdByUserId: string,
		environmentId: string,
	) => ({
		id,
		organizationId,
		createdByUserId,
		environmentId,
		name: `ws-${id.slice(-1)}`,
		branch: "main",
		baseBranch: "main",
		providerSandboxId: `sbx-${id}`,
	});
	await db.insert(schema.cloudWorkspaces).values([
		{
			...workspace(CHECKOUT, ORG, MAYA, env.id),
			name: "fix-flaky-checkout",
			status: "asleep",
			machineSize: "medium",
		},
		{
			...workspace(BILLING_PAGE, ORG, SAM, env.id),
			name: "billing-page",
			status: "awake",
		},
		{
			...workspace(BROKEN, ORG, MAYA, env.id),
			name: "broken-env",
			status: "failed",
			failureReason: "snapshot_expired",
			failedAt: new Date("2026-11-16T14:03:00Z"),
		},
		workspace(OTHER_WS, OTHER_ORG, BEN, otherEnv.id),
	]);
	const boot = (
		id: string,
		cloudWorkspaceId: string,
		createdByUserId: string,
		vcpus: number,
		startedAt: string,
		stoppedAt: string | null,
		endReason: CloudWorkspaceBootEndReason | null,
		organizationId = ORG,
	) => ({
		id,
		organizationId,
		cloudWorkspaceId,
		createdByUserId,
		vcpus,
		memoryMb: vcpus * 2048,
		startedAt: new Date(startedAt),
		stoppedAt: stoppedAt ? new Date(stoppedAt) : null,
		endReason,
	});
	await db
		.insert(schema.cloudWorkspaceBoots)
		.values([
			boot(
				"boot_1",
				CHECKOUT,
				MAYA,
				4,
				"2026-11-10T09:00:00Z",
				"2026-11-10T11:15:00Z",
				"idle",
			),
			boot(
				"boot_2",
				CHECKOUT,
				MAYA,
				4,
				"2026-11-12T08:00:00Z",
				"2026-11-12T08:01:00Z",
				"failed",
			),
			boot(
				"boot_3",
				BILLING_PAGE,
				SAM,
				8,
				"2026-10-31T23:00:00Z",
				"2026-11-01T01:00:00Z",
				"user",
			),
			boot("boot_4", BILLING_PAGE, SAM, 8, "2026-11-17T08:00:00Z", null, null),
			boot(
				"boot_5",
				OTHER_WS,
				BEN,
				4,
				"2026-11-10T09:00:00Z",
				"2026-11-10T10:00:00Z",
				"idle",
				OTHER_ORG,
			),
		]);
	const event = (
		bootId: string,
		lockSeq: number,
		cloudWorkspaceId: string,
		userId: string,
		windowFrom: string,
		windowTo: string,
		amount: number,
		sentAt: string | null,
		organizationId = ORG,
	) => ({
		bootId,
		lockSeq,
		feature: "box_gb_minutes" as const,
		organizationId,
		cloudWorkspaceId,
		userId,
		windowFrom: new Date(windowFrom),
		windowTo: new Date(windowTo),
		amount: String(amount),
		sentAt: sentAt ? new Date(sentAt) : null,
	});
	await db
		.insert(schema.cloudUsageEvents)
		.values([
			event(
				"boot_1",
				1,
				CHECKOUT,
				MAYA,
				"2026-11-10T09:00:00Z",
				"2026-11-10T10:00:00Z",
				480,
				"2026-11-10T10:05:00Z",
			),
			event(
				"boot_1",
				2,
				CHECKOUT,
				MAYA,
				"2026-11-10T10:00:00Z",
				"2026-11-10T11:15:00Z",
				600,
				"2026-11-10T11:20:00Z",
			),
			event(
				"boot_3",
				1,
				BILLING_PAGE,
				SAM,
				"2026-10-31T23:00:00Z",
				"2026-11-01T00:00:00Z",
				960,
				"2026-10-31T23:59:59.999Z",
			),
			event(
				"boot_3",
				2,
				BILLING_PAGE,
				SAM,
				"2026-11-01T00:00:00Z",
				"2026-11-01T01:00:00Z",
				960,
				"2026-11-01T00:00:00Z",
			),
			event(
				"boot_4",
				1,
				BILLING_PAGE,
				SAM,
				"2026-11-17T08:00:00Z",
				"2026-11-17T09:00:00Z",
				960,
				null,
			),
			event(
				"boot_5",
				1,
				OTHER_WS,
				BEN,
				"2026-11-10T09:00:00Z",
				"2026-11-10T10:00:00Z",
				100,
				"2026-11-10T10:05:00Z",
				OTHER_ORG,
			),
		]);
});

const usage = (
	options: Partial<Parameters<typeof queryCloudUsage>[2]>,
	userId?: string,
) =>
	queryCloudUsage(
		db,
		{ organizationId: ORG, userId },
		{ range: NOVEMBER, limit: 25, overagePerGbHour: RATE, ...options },
	).then((result) => usageResultSchema.parse(result));

const brief = (
	items: {
		key: string | null;
		gbHours: number;
		boots: number;
		failedBoots: number;
	}[],
) =>
	items.map(({ key, gbHours, boots, failedBoots }) => ({
		key,
		gbHours,
		boots,
		failedBoots,
	}));

describe("queryCloudUsage", () => {
	test("totals sent events and started boots in the window, and nothing of another organization", async () => {
		const result = await usage({});
		expect(result.items).toEqual([]);
		expect(result.total).toEqual({
			workspaces: 2,
			boots: 3,
			failedBoots: 1,
			hours: 3.25,
			gbHours: 34,
			usageUsd: 2.04,
		});
	});

	test("groups by user, by UTC day of sent_at, and by workspace", async () => {
		expect(brief((await usage({ groupBy: "user" })).items)).toEqual([
			{ key: MAYA, gbHours: 18, boots: 2, failedBoots: 1 },
			{ key: SAM, gbHours: 16, boots: 1, failedBoots: 0 },
		]);
		expect(brief((await usage({ groupBy: "day" })).items)).toEqual([
			{ key: "2026-11-17", gbHours: 0, boots: 1, failedBoots: 0 },
			{ key: "2026-11-12", gbHours: 0, boots: 1, failedBoots: 1 },
			{ key: "2026-11-10", gbHours: 18, boots: 1, failedBoots: 0 },
			{ key: "2026-11-01", gbHours: 16, boots: 0, failedBoots: 0 },
		]);
		const byWorkspace = await usage({ groupBy: "workspace" });
		expect(
			byWorkspace.items.map((item) => [item.label, item.usageUsd]),
		).toEqual([
			["fix-flaky-checkout", 1.08],
			["billing-page", 0.96],
			["broken-env", 0],
		]);
		expect(byWorkspace.items[1]?.ref).toEqual({
			id: BILLING_PAGE,
			name: "billing-page",
			status: "awake",
			size: "large",
			owner: { id: SAM, name: "Sam", email: "sam@example.com" },
			failure: null,
		});
	});

	test("a workspace that failed with no boot appears with its failure", async () => {
		const { items } = await usage({
			groupBy: "workspace",
			filters: { workspace: BROKEN },
		});
		expect(items).toEqual([
			{
				key: BROKEN,
				label: "broken-env",
				ref: {
					id: BROKEN,
					name: "broken-env",
					status: "failed",
					size: "large",
					owner: { id: MAYA, name: "Maya", email: "maya@example.com" },
					failure: {
						reason: "snapshot_expired",
						at: "2026-11-16T14:03:00.000Z",
					},
				},
				workspaces: 0,
				boots: 0,
				failedBoots: 0,
				hours: 0,
				gbHours: 0,
				usageUsd: 0,
			},
		]);
	});
});

describe("scope", () => {
	test("a member gets only their own rows in every function", async () => {
		const own = await usage({ groupBy: "workspace" }, SAM);
		expect(own.items.map((item) => item.key)).toEqual([BILLING_PAGE]);
		expect(own.total).toMatchObject({ gbHours: 16, boots: 1 });

		const ownBoots = await listCloudBoots(
			db,
			{ organizationId: ORG, userId: MAYA },
			{ range: NOVEMBER, limit: 25, now: NOW, overagePerGbHour: RATE },
		);
		expect(ownBoots.items.map((item) => item.id)).toEqual(["boot_2", "boot_1"]);

		const ownPeriods = await listCloudPeriods(
			db,
			{ organizationId: ORG, userId: SAM },
			reader,
			{ limit: 6 },
		);
		expect(
			ownPeriods.items.map((p) => [p.id, p.allowance, p.metrics.gbHours]),
		).toEqual([
			["2026-11-01", null, 16],
			["2026-10-01", null, 16],
		]);
	});
});

describe("listCloudBoots", () => {
	test("lists boots newest first; failed and open boots have only sent usage", async () => {
		const result = bootsResultSchema.parse(
			await listCloudBoots(
				db,
				{ organizationId: ORG },
				{ range: NOVEMBER, limit: 25, now: NOW, overagePerGbHour: RATE },
			),
		);
		expect(
			result.items.map((b) => [
				b.id,
				b.endReason,
				b.gbHours,
				b.usageUsd,
				b.minutes,
			]),
		).toEqual([
			["boot_4", null, 0, 0, 960],
			["boot_2", "failed", 0, 0, 1],
			["boot_1", "idle", 18, 1.08, 135],
		]);
		expect(result.items[2]).toMatchObject({
			workspace: { id: CHECKOUT, name: "fix-flaky-checkout" },
			user: { id: MAYA, name: "Maya", email: "maya@example.com" },
			size: "medium",
			memoryGb: 8,
		});
		const failedOnly = await listCloudBoots(
			db,
			{ organizationId: ORG },
			{
				range: NOVEMBER,
				endReason: ["failed"],
				open: false,
				limit: 25,
				now: NOW,
				overagePerGbHour: RATE,
			},
		);
		expect(failedOnly.items.map((b) => b.id)).toEqual(["boot_2"]);
	});
});

describe("listCloudPeriods", () => {
	test("periods step back from the reset to the first boot, split by sent_at", async () => {
		const result = periodsResultSchema.parse(
			await listCloudPeriods(db, { organizationId: ORG }, reader, { limit: 6 }),
		);
		expect(
			result.items.map((p) => [
				p.id,
				p.end,
				p.closed,
				p.metrics.gbHours,
				p.metrics.boots,
			]),
		).toEqual([
			["2026-11-01", "2026-12-01T00:00:00.000Z", false, 34, 3],
			["2026-10-01", "2026-11-01T00:00:00.000Z", true, 16, 1],
		]);
		expect(result.items[0]?.allowance).toEqual({
			includedGbHours: 7000,
			usedGbHours: 34,
			overageGbHours: 0,
			prepaidRemainingGbHours: 150,
			resetsAt: "2026-12-01T00:00:00.000Z",
		});
		expect(result.items[1]?.allowance).toBeNull();
		const october = await usage({
			range: resolveRange({ period: "2026-10-01" }, NOW, BILLING.resetsAt),
		});
		expect(october.total.gbHours).toBe(16);
		expect(result.nextCursor).toBeNull();
	});

	test("billing off returns no periods", async () => {
		expect(
			await listCloudPeriods(
				db,
				{ organizationId: ORG },
				{ billing: async () => null },
				{ limit: 6 },
			),
		).toEqual({ items: [], nextCursor: null });
	});
});

describe("cursors", () => {
	async function pages<T>(
		fetch: (
			cursor: string | null,
		) => Promise<{ items: T[]; nextCursor: string | null }>,
	) {
		const all: T[] = [];
		let cursor: string | null = null;
		do {
			const page = await fetch(cursor);
			all.push(...page.items);
			cursor = page.nextCursor;
		} while (cursor);
		return all;
	}

	test("paging one row at a time returns every row once, in order", async () => {
		for (const groupBy of ["workspace", "day"] as const) {
			const whole = await usage({ groupBy });
			expect(
				await pages((cursor) => usage({ groupBy, limit: 1, cursor })),
			).toEqual(whole.items);
		}
		const bootPage = (limit: number, cursor: string | null) =>
			listCloudBoots(
				db,
				{ organizationId: ORG },
				{ range: NOVEMBER, limit, cursor, now: NOW, overagePerGbHour: RATE },
			);
		expect(await pages((cursor) => bootPage(1, cursor))).toEqual(
			(await bootPage(25, null)).items,
		);
		const periodIds = await pages((cursor) =>
			listCloudPeriods(db, { organizationId: ORG }, reader, {
				limit: 1,
				cursor,
			}),
		);
		expect(periodIds.map((p) => p.id)).toEqual(["2026-11-01", "2026-10-01"]);
	});

	test("a cursor that was not issued is an input error", async () => {
		await expect(
			usage({ groupBy: "workspace", cursor: "garbage" }),
		).rejects.toBeInstanceOf(CloudUsageInputError);
	});
});

describe("resolveRange", () => {
	test("periods are whole months back from the reset, clamped to short months", () => {
		const resetsAt = new Date("2026-03-31T07:00:00Z");
		expect(resolveRange({ period: "current" }, NOW, resetsAt)).toEqual({
			from: new Date("2026-02-28T07:00:00Z"),
			to: resetsAt,
		});
		expect(resolveRange({ period: "2026-01-31" }, NOW, resetsAt)).toEqual({
			from: new Date("2026-01-31T07:00:00Z"),
			to: new Date("2026-02-28T07:00:00Z"),
		});
		expect(() => resolveRange({ period: "2026-01-30" }, NOW, resetsAt)).toThrow(
			CloudUsageInputError,
		);
		expect(() => resolveRange({ period: "current" }, NOW, null)).toThrow(
			CloudUsageInputError,
		);
		expect(resolveRange("7d", NOW, null)).toEqual({
			from: new Date("2026-11-11T00:00:00Z"),
			to: NOW,
		});
	});
});
