import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { generateDrizzleJson, generateMigration } from "drizzle-kit/api";
import {
	getTableConfig,
	isPgEnum,
	isPgSchema,
	type PgTable,
} from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/schema";

export const ORG = "a0000000-0000-4000-8000-000000000001";
export const OTHER_ORG = "a0000000-0000-4000-8000-000000000002";
export const MAYA = "b0000000-0000-4000-8000-000000000001";
export const SAM = "b0000000-0000-4000-8000-000000000002";
export const BEN = "b0000000-0000-4000-8000-000000000003";
export const ADA = "b0000000-0000-4000-8000-000000000004";
export const CHECKOUT = "c0000000-0000-4000-8000-000000000001";
export const BILLING_PAGE = "c0000000-0000-4000-8000-000000000002";
export const BROKEN = "c0000000-0000-4000-8000-000000000003";
export const OTHER_WS = "c0000000-0000-4000-8000-000000000004";

export const NOW = new Date("2026-11-18T00:00:00Z");
export const OCTOBER = {
	from: new Date("2026-10-01T00:00:00Z"),
	to: new Date("2026-11-01T00:00:00Z"),
};
export const NOVEMBER = {
	from: OCTOBER.to,
	to: new Date("2026-12-01T00:00:00Z"),
};
export const RATE = 0.06;

const CLOUD_USAGE_DAILY_MIGRATIONS = [
	"0201_cloud_usage_daily_trigger.sql",
	"0202_cloud_usage_daily_backfill.sql",
].map((name) => new URL(`../drizzle/${name}`, import.meta.url));

/** An in-process Postgres with the cloud usage tables, seeded with two organizations. */
export async function seedCloudUsage() {
	const tables = new Set<PgTable>();
	const withParents = (table: PgTable) => {
		if (tables.has(table)) return;
		tables.add(table);
		for (const key of getTableConfig(table).foreignKeys) {
			withParents(key.reference().foreignTable);
		}
	};
	withParents(schema.cloudUsageEvents);
	withParents(schema.members);
	withParents(schema.cloudUsageDaily);
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
	for (const migration of CLOUD_USAGE_DAILY_MIGRATIONS) {
		await client.exec(readFileSync(migration, "utf8"));
	}
	const db = drizzle({ client, schema, casing: "snake_case" });

	await db.insert(schema.organizations).values([
		{
			id: ORG,
			name: "Northwind",
			slug: "northwind",
			createdAt: new Date("2026-09-15T00:00:00Z"),
		},
		{ id: OTHER_ORG, name: "Other", slug: "other" },
	]);
	await db.insert(schema.users).values(
		(
			[
				[MAYA, "Maya"],
				[SAM, "Sam"],
				[BEN, "Ben"],
				[ADA, "Ada"],
			] as const
		).map(([id, name]) => ({ id, name, email: `${name}@example.com` })),
	);
	await db.insert(schema.members).values([
		{ organizationId: ORG, userId: MAYA, role: "owner" },
		{ organizationId: ORG, userId: SAM, role: "member" },
		{ organizationId: ORG, userId: ADA, role: "admin" },
		{ organizationId: OTHER_ORG, userId: BEN, role: "owner" },
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
				// Another person's boot of Sam's workspace, after every window the tests read.
				[
					"boot_7",
					BILLING_PAGE,
					MAYA,
					8,
					"2026-12-05T08:00Z",
					"2026-12-05T09:00Z",
					"user",
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
	return db;
}
