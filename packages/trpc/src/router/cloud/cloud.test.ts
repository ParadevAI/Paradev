import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { CloudUsage } from "@superset/auth/billing";
import {
	ADA,
	BEN,
	BILLING_PAGE,
	BROKEN,
	CHECKOUT,
	MAYA,
	NOVEMBER,
	ORG,
	OTHER_WS,
	SAM,
	seedCloudUsage,
} from "@superset/db/testing";
import type { PlanTier } from "@superset/shared/billing";
import {
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
} from "../../trpc";
import { type CloudDeps, cloudRouterWith } from "./cloud";

const CLOUD_USAGE: CloudUsage = {
	includedGbMinutes: 1200,
	usedGbMinutes: 2040,
	overageGbMinutes: 840,
	prepaidGbMinutes: 0,
	bought: { grantedGbMinutes: 0, remainingGbMinutes: 0 },
	freeCredits: { grantedGbMinutes: 0, remainingGbMinutes: 0 },
	seats: 2,
	overageLimit: { type: "none" },
	limitReached: false,
	autoTopup: null,
	pack: null,
	overagePerGbHour: 0.06,
	resetsAt: "2026-12-01T00:00:00.000Z",
};

let db: Awaited<ReturnType<typeof seedCloudUsage>>;

beforeAll(async () => {
	db = await seedCloudUsage();
});

function caller(
	userId: string,
	{
		enabled = true,
		readCloudUsage = async (): Promise<CloudUsage | null> => CLOUD_USAGE,
		tier = "pro",
		billingOff = false,
		listRatePerGbHour = async () => null,
		startedAt = null,
	}: {
		enabled?: boolean;
		readCloudUsage?: () => Promise<CloudUsage | null>;
		tier?: PlanTier;
		billingOff?: boolean;
		listRatePerGbHour?: CloudDeps["listRatePerGbHour"];
		startedAt?: string | null;
	} = {},
) {
	const router = createTRPCRouter({
		cloud: cloudRouterWith({
			db,
			billing: async () =>
				billingOff
					? null
					: { tier, startedAt, cloudUsage: await readCloudUsage() },
			listRatePerGbHour,
			flags: { isFeatureEnabled: async () => enabled },
		}),
	});
	return createCallerFactory(router)(
		createTRPCContext({
			session: {
				user: { id: userId, email: `${userId}@example.com` },
				session: { activeOrganizationId: ORG },
			} as never,
			auth: {} as never,
			headers: new Headers(),
		}),
	).cloud;
}

describe("scope", () => {
	test.each([
		["an owner", MAYA],
		["an admin", ADA],
	])("%s sees the whole organization, by person too", async (_, userId) => {
		const owner = caller(userId);
		const byWorkspace = await owner.usage.query({
			range: NOVEMBER,
			groupBy: "workspace",
		});
		expect(byWorkspace.items.map((item) => item.key)).toEqual([
			CHECKOUT,
			BILLING_PAGE,
			BROKEN,
		]);
		expect(byWorkspace.total).toMatchObject({ gbHours: 34, usageUsd: 2.04 });
		const byUser = await owner.usage.query({
			range: NOVEMBER,
			groupBy: "user",
		});
		expect(byUser.items.map((item) => item.key)).toEqual([MAYA, SAM]);
		const [open] = (await owner.periods.list({})).items;
		expect(open?.allowance).toMatchObject({
			includedGbHours: 20,
			usedGbHours: 34,
		});
	});

	test("a member sees only their own usage, boots and periods", async () => {
		const member = caller(SAM);
		const usage = await member.usage.query({
			range: NOVEMBER,
			groupBy: "workspace",
		});
		expect(usage.items.map((item) => item.key)).toEqual([BILLING_PAGE]);
		expect(usage.total).toMatchObject({ gbHours: 16, boots: 1 });
		const boots = await member.boots.list({ range: NOVEMBER });
		expect(boots.items.map((boot) => boot.user?.id)).toEqual([SAM]);
		const [open] = (await member.periods.list({})).items;
		expect(open?.allowance).toBeNull();
		expect(open?.unavailable).toEqual([
			{ field: "allowance", reason: "owners_and_admins_only" },
		]);
		expect(open?.metrics.gbHours).toBe(16);
	});

	test("a member's workspace filter finds only their own workspace", async () => {
		const filtered = (workspace: string) =>
			caller(SAM).usage.query({ range: NOVEMBER, workspace });
		expect((await filtered(BILLING_PAGE)).total).toMatchObject({
			gbHours: 16,
			boots: 1,
		});
		expect((await filtered(CHECKOUT)).total).toMatchObject({
			gbHours: 0,
			boots: 0,
			workspaces: 0,
		});
	});

	test("a workspace in another organization returns nothing", async () => {
		const usage = await caller(MAYA).usage.query({
			range: NOVEMBER,
			groupBy: "workspace",
			workspace: OTHER_WS,
		});
		expect(usage.items).toEqual([]);
		expect(usage.total).toMatchObject({ gbHours: 0, boots: 0, workspaces: 0 });
	});

	test("an owner filters workspaces by person, size, status and name, with a row count", async () => {
		const workspaces = async (filters: object) => {
			const { items, rowCount: count } = await caller(MAYA).usage.query({
				range: NOVEMBER,
				groupBy: "workspace",
				...filters,
			});
			return { keys: items.map((item) => item.key), count };
		};
		expect(await workspaces({ user: SAM })).toEqual({
			keys: [BILLING_PAGE],
			count: 1,
		});
		expect(await workspaces({ size: "medium" })).toEqual({
			keys: [CHECKOUT],
			count: 1,
		});
		expect(await workspaces({ status: ["failed", "awake"] })).toEqual({
			keys: [BILLING_PAGE, BROKEN],
			count: 2,
		});
		expect(await workspaces({ search: "BILLING" })).toEqual({
			keys: [BILLING_PAGE],
			count: 1,
		});
	});

	test("a member's filters never reach past their own workspaces", async () => {
		const member = (filters: object) =>
			caller(SAM).usage.query({
				range: NOVEMBER,
				groupBy: "workspace",
				...filters,
			});
		const own = await member({});
		expect(await member({ user: MAYA })).toEqual(own);
		for (const filters of [
			{ status: ["asleep", "failed"] },
			{ size: "medium" },
			{ search: "check" },
		]) {
			const { items, total, rowCount } = await member(filters);
			expect(items).toEqual([]);
			expect(rowCount).toBe(0);
			expect(total).toMatchObject({ gbHours: 0, boots: 0, workspaces: 0 });
		}
	});

	test("a person of another organization returns nothing", async () => {
		const usage = await caller(MAYA).usage.query({
			range: NOVEMBER,
			groupBy: "workspace",
			user: BEN,
		});
		expect(usage.items).toEqual([]);
		expect(usage.total).toMatchObject({ gbHours: 0, boots: 0, workspaces: 0 });
	});

	test("a person filter that is not a user id is BAD_REQUEST", async () => {
		await expect(
			caller(MAYA).usage.query({
				range: NOVEMBER,
				groupBy: "workspace",
				user: "not-a-uuid",
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	});

	test("a workspace's last boot is the newest one the caller may see, with when it stopped", async () => {
		const lastBoot = async (userId: string) =>
			(
				await caller(userId).usage.query({
					range: NOVEMBER,
					groupBy: "workspace",
					workspace: BILLING_PAGE,
				})
			).items.map((item) =>
				item.ref && "lastBoot" in item.ref ? item.ref.lastBoot : undefined,
			);
		expect(await lastBoot(MAYA)).toEqual([
			{ endReason: "user", stoppedAt: new Date("2026-12-05T09:00:00Z") },
		]);
		expect(await lastBoot(SAM)).toEqual([{ endReason: null, stoppedAt: null }]);
	});

	test("a signed-in person outside the organization is FORBIDDEN", async () => {
		await expect(
			caller(BEN).usage.query({ range: NOVEMBER }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test.each([
		["user", {}],
		["userDay", { users: [MAYA] }],
	] as const)("a member cannot group by person (%s)", async (groupBy, extra) => {
		await expect(
			caller(SAM).usage.query({ range: NOVEMBER, groupBy, ...extra }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("a member opening another person's workspace by id gets nothing of it", async () => {
		const member = caller(SAM);
		const usage = await member.usage.query({
			range: NOVEMBER,
			workspace: CHECKOUT,
			groupBy: "workspace",
			limit: 1,
		});
		expect(usage.items).toEqual([]);
		expect(usage.total).toMatchObject({ gbHours: 0, boots: 0, workspaces: 0 });
		const boots = await member.boots.list({
			range: NOVEMBER,
			workspace: CHECKOUT,
		});
		expect(boots.items).toEqual([]);
	});
});

const encoded = (cursor: object) =>
	Buffer.from(JSON.stringify(cursor)).toString("base64url");

const decoded = (cursor: string) =>
	JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));

test("a cursor that does not decode is BAD_REQUEST", async () => {
	const owner = caller(MAYA);
	const filters = { groupBy: "workspace", range: NOVEMBER };
	for (const cursor of [
		"not-a-cursor",
		encoded({
			filters,
			keyset: { sort: "gbMinutes", value: "1 or 1=1", key: "" },
		}),
		encoded({ filters, keyset: { sort: "key", key: "2026-11-17" } }),
	]) {
		await expect(
			owner.usage.query({ range: NOVEMBER, groupBy: "workspace", cursor }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	}
	await expect(
		owner.boots.list({
			range: NOVEMBER,
			cursor: encoded({
				filters: { range: NOVEMBER },
				keyset: { sort: "startedAt", value: "yesterday", key: "boot_1" },
			}),
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	await expect(
		owner.periods.list({ cursor: "2026-10-02" }),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test("a cursor read with other filters, or made before cursors held them, is BAD_REQUEST", async () => {
	const owner = caller(MAYA);
	const usageCursor = (
		await owner.usage.query({ range: NOVEMBER, groupBy: "workspace", limit: 1 })
	).nextCursor;
	const bootsCursor = (await owner.boots.list({ range: NOVEMBER, limit: 1 }))
		.nextCursor;
	if (!usageCursor || !bootsCursor) throw new Error("No second page to read");
	const notValid = {
		code: "BAD_REQUEST",
		message:
			"That cursor could not be read. Drop it to start from the first page.",
	};
	for (const input of [
		{ range: NOVEMBER, groupBy: "user" },
		{ range: "30d", groupBy: "workspace" },
		{ range: NOVEMBER, groupBy: "workspace", workspace: CHECKOUT },
		{ range: NOVEMBER, groupBy: "workspace", user: MAYA },
		{ range: NOVEMBER, groupBy: "workspace", size: "medium" },
		{ range: NOVEMBER, groupBy: "workspace", status: ["asleep"] },
		{ range: NOVEMBER, groupBy: "workspace", search: "e" },
		{ range: NOVEMBER, groupBy: "workspace", sort: "hours" },
		{ range: NOVEMBER, groupBy: "workspace", order: "asc" },
	] as const) {
		await expect(
			owner.usage.query({ ...input, limit: 1, cursor: usageCursor }),
		).rejects.toMatchObject(notValid);
	}
	for (const input of [
		{ range: "30d" },
		{ range: NOVEMBER, workspace: CHECKOUT },
		{ range: NOVEMBER, open: true },
	] as const) {
		await expect(
			owner.boots.list({ ...input, limit: 1, cursor: bootsCursor }),
		).rejects.toMatchObject(notValid);
	}
	const unbound = encoded({ sort: "gbMinutes", value: "1080", key: CHECKOUT });
	await expect(
		owner.usage.query({
			range: NOVEMBER,
			groupBy: "workspace",
			cursor: unbound,
		}),
	).rejects.toMatchObject(notValid);
});

test("a cursor's filters match in any key order", async () => {
	const owner = caller(MAYA);
	const input = { range: NOVEMBER, groupBy: "workspace", limit: 1 } as const;
	const { nextCursor } = await owner.usage.query(input);
	if (!nextCursor) throw new Error("No second page to read");
	const { filters, keyset } = decoded(nextCursor);
	expect(Object.keys(filters)).toEqual(["groupBy", "range"]);
	const reordered = encoded({
		keyset,
		filters: { range: filters.range, groupBy: filters.groupBy },
	});
	expect(await owner.usage.query({ ...input, cursor: reordered })).toEqual(
		await owner.usage.query({ ...input, cursor: nextCursor }),
	);
});

test("paging one row at a time with the opaque cursor returns every row once", async () => {
	const owner = caller(MAYA);
	async function pages<Item>(
		fetch: (
			cursor?: string,
		) => Promise<{ items: Item[]; nextCursor: string | null }>,
	) {
		const all: Item[] = [];
		let cursor: string | undefined;
		for (let calls = 0; calls < 10; calls++) {
			const page = await fetch(cursor);
			all.push(...page.items);
			if (!page.nextCursor) break;
			cursor = page.nextCursor;
		}
		return all;
	}
	for (const input of [
		{ groupBy: "workspace" },
		{ groupBy: "day" },
		{ groupBy: "workspace", sort: "name", order: "asc" },
		{ groupBy: "workspace", sort: "status" },
		{ groupBy: "user", sort: "boots", order: "asc" },
	] as const) {
		expect(
			await pages((cursor) =>
				owner.usage.query({ range: NOVEMBER, ...input, limit: 1, cursor }),
			),
		).toEqual((await owner.usage.query({ range: NOVEMBER, ...input })).items);
	}
	const boots = (await owner.boots.list({ range: NOVEMBER })).items;
	expect(
		(
			await pages((cursor) =>
				owner.boots.list({ range: NOVEMBER, limit: 1, cursor }),
			)
		).map((boot) => boot.id),
	).toEqual(boots.map((boot) => boot.id));
});

test("sorting by name or status needs grouping by workspace", async () => {
	await expect(
		caller(MAYA).usage.query({
			range: NOVEMBER,
			groupBy: "user",
			sort: "name",
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test("with the flag off every procedure is FORBIDDEN and billing is not read", async () => {
	const readCloudUsage = mock(async () => CLOUD_USAGE);
	const off = caller(MAYA, { enabled: false, readCloudUsage });
	for (const call of [
		() => off.usage.query({ range: "7d" }),
		() => off.boots.list({ range: "7d" }),
		() => off.periods.list({}),
	]) {
		await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
	}
	expect(readCloudUsage).not.toHaveBeenCalled();
});

test("periods run from the open one back to the one the organization was created in", async () => {
	const owner = caller(MAYA);
	const first = await owner.periods.list({ limit: 2 });
	expect(first.items.map((period) => [period.id, period.closed])).toEqual([
		["2026-11-01", false],
		["2026-10-01", true],
	]);
	expect(first.items.map((period) => period.metrics.gbHours)).toEqual([34, 16]);
	expect(first.items[1]?.allowance).toBeNull();
	expect(first.items[1]?.unavailable).toEqual([
		{ field: "allowance", reason: "closed_period" },
	]);
	expect(first.nextCursor).toBe("2026-10-01");
	const rest = await owner.periods.list({ limit: 2, cursor: "2026-10-01" });
	expect(rest.items.map((period) => period.id)).toEqual(["2026-09-01"]);
	expect(rest.nextCursor).toBeNull();
	const october = await owner.usage.query({ range: { period: "2026-10-01" } });
	expect(october.range).toEqual({
		from: new Date("2026-10-01T00:00:00Z"),
		to: new Date("2026-11-01T00:00:00Z"),
	});
	expect(october.total.gbHours).toBe(16);
	await expect(
		owner.usage.query({ range: { period: "2026-10-02" } }),
	).rejects.toMatchObject({ code: "NOT_FOUND" });
});

test("with billing off there are no periods and no prices", async () => {
	const owner = caller(MAYA, {
		billingOff: true,
		listRatePerGbHour: async () => 0.06,
	});
	expect(await owner.periods.list({})).toEqual({ items: [], nextCursor: null });
	await expect(
		owner.usage.query({ range: { period: "current" } }),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	const usage = await owner.usage.query({ range: NOVEMBER });
	expect(usage.total).toMatchObject({ gbHours: 34, usageUsd: null });
});

test("the open period's allowance is in dollars at the usage rate, with bought and free credit apart", async () => {
	const owner = caller(MAYA, {
		readCloudUsage: async () => ({
			...CLOUD_USAGE,
			prepaidGbMinutes: 360,
			bought: { grantedGbMinutes: 600, remainingGbMinutes: 300 },
			freeCredits: { grantedGbMinutes: 120, remainingGbMinutes: 60 },
			overageLimit: { type: "absolute", gbMinutes: 6000 },
		}),
	});
	const [open] = (await owner.periods.list({})).items;
	expect(open?.allowance).toMatchObject({
		usedUsd: 2.04,
		includedUsd: 1.2,
		overageUsd: 0.84,
		seats: 2,
		bought: { usedGbHours: 5, totalGbHours: 10, usedUsd: 0.3, totalUsd: 0.6 },
		freeCredits: {
			usedGbHours: 1,
			totalGbHours: 2,
			usedUsd: 0.06,
			totalUsd: 0.12,
		},
		extraUsageLimit: { gbHours: 100, usd: 6 },
		limitReached: false,
	});
	expect(open?.unavailable).toEqual([]);
});

test.each([
	["no cap: no amount, never reached", { type: "none" }, false, []],
	["a cap reached", { type: "absolute", gbMinutes: 0 }, true, []],
	[
		"a percentage cap: neither amount nor reached is known",
		{ type: "usage_percentage", percent: 300 },
		null,
		[
			{ field: "extraUsageLimit", reason: "percent_of_allowance" },
			{ field: "limitReached", reason: "not_tracked" },
		],
	],
	[
		"a usage limit beside an absolute cap: reached is not known",
		{ type: "absolute", gbMinutes: 0 },
		null,
		[{ field: "limitReached", reason: "not_tracked" }],
	],
] as const)("extra usage with %s", async (_, overageLimit, limitReached, reasons) => {
	const owner = caller(MAYA, {
		readCloudUsage: async () => ({
			...CLOUD_USAGE,
			overageLimit,
			limitReached,
		}),
	});
	const [open] = (await owner.periods.list({})).items;
	expect(open?.allowance?.limitReached).toBe(limitReached);
	expect(open?.unavailable).toEqual([...reasons]);
});

test("a billing value cached before the credit, seat and limit fields says not_read for each", async () => {
	const owner = caller(MAYA, {
		readCloudUsage: async () => ({
			...CLOUD_USAGE,
			bought: null,
			freeCredits: null,
			seats: null,
			overageLimit: null,
			limitReached: null,
		}),
	});
	const [open] = (await owner.periods.list({})).items;
	expect(open?.allowance).toMatchObject({
		seats: null,
		bought: null,
		freeCredits: null,
		extraUsageLimit: null,
		limitReached: null,
	});
	expect(open?.unavailable).toEqual(
		["seats", "bought", "freeCredits", "extraUsageLimit", "limitReached"].map(
			(field) => ({ field, reason: "not_read" }),
		),
	);
});

describe("the list rate", () => {
	const LIST_RATE = 0.06;

	test("prices an organization with no paid plan", async () => {
		const owner = caller(MAYA, {
			tier: "free",
			readCloudUsage: async () => null,
			listRatePerGbHour: async () => LIST_RATE,
		});
		const usage = await owner.usage.query({ range: NOVEMBER });
		expect(usage.total).toMatchObject({ gbHours: 34, usageUsd: 2.04 });
		const boots = await owner.boots.list({ range: NOVEMBER });
		expect(boots.items.every((boot) => boot.usageUsd !== null)).toBe(true);
	});

	test("prices a free organization's open period and its allowance", async () => {
		const owner = caller(MAYA, {
			tier: "free",
			readCloudUsage: async () => ({ ...CLOUD_USAGE, overagePerGbHour: null }),
			listRatePerGbHour: async () => LIST_RATE,
		});
		const [open] = (await owner.periods.list({})).items;
		expect(open?.metrics.usageUsd).toBe(2.04);
		expect(open?.allowance).toMatchObject({ usedUsd: 2.04, includedUsd: 1.2 });
	});

	test("never prices a paid plan whose own rate could not be read", async () => {
		const listRatePerGbHour = mock(async () => LIST_RATE);
		const owner = caller(MAYA, {
			tier: "pro",
			readCloudUsage: async () => ({ ...CLOUD_USAGE, overagePerGbHour: null }),
			listRatePerGbHour,
		});
		const usage = await owner.usage.query({ range: NOVEMBER });
		expect(usage.total.usageUsd).toBeNull();
		const [open] = (await owner.periods.list({})).items;
		expect(open?.metrics.usageUsd).toBeNull();
		expect(open?.allowance?.usedUsd).toBeNull();
		expect(listRatePerGbHour).not.toHaveBeenCalled();
	});

	test("never prices an organization whose plan is unknown (billing unreachable, fail-open)", async () => {
		const owner = caller(MAYA, {
			tier: "pro",
			readCloudUsage: async () => null,
			listRatePerGbHour: async () => LIST_RATE,
		});
		const usage = await owner.usage.query({ range: NOVEMBER });
		expect(usage.total.usageUsd).toBeNull();
	});

	test("is no price when the catalog has none", async () => {
		const owner = caller(MAYA, {
			tier: "free",
			readCloudUsage: async () => null,
			listRatePerGbHour: async () => null,
		});
		const usage = await owner.usage.query({ range: NOVEMBER });
		expect(usage.total.usageUsd).toBeNull();
	});

	test("does not replace an organization's own rate, and is not read for it", async () => {
		const listRatePerGbHour = mock(async () => LIST_RATE);
		const owner = caller(MAYA, {
			readCloudUsage: async () => ({ ...CLOUD_USAGE, overagePerGbHour: 0.1 }),
			listRatePerGbHour,
		});
		const usage = await owner.usage.query({ range: NOVEMBER });
		expect(usage.total.usageUsd).toBeCloseTo(3.4);
		expect(listRatePerGbHour).not.toHaveBeenCalled();
	});
});

test("an organization billed on the 31st sees its period start on the 31st", async () => {
	const owner = caller(MAYA, {
		startedAt: "2026-08-31T05:00:00.000Z",
		readCloudUsage: async () => ({
			...CLOUD_USAGE,
			resetsAt: "2026-11-30T05:00:00.000Z",
		}),
	});
	const [open] = (await owner.periods.list({})).items;
	expect(open?.id).toBe("2026-10-31");
	await expect(
		owner.usage.query({ range: { period: "2026-10-31" } }),
	).resolves.toBeDefined();
});
