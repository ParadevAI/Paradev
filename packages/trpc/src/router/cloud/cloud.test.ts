import { beforeAll, describe, expect, test } from "bun:test";
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
	SAM,
	seedCloudUsage,
} from "@superset/db/testing";
import {
	createCallerFactory,
	createTRPCContext,
	createTRPCRouter,
} from "../../trpc";
import { cloudRouterWith } from "./cloud";

const CLOUD_USAGE: CloudUsage = {
	includedGbMinutes: 1200,
	usedGbMinutes: 2040,
	overageGbMinutes: 840,
	prepaidGbMinutes: 0,
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
		cloudUsage = CLOUD_USAGE,
		enabled = true,
	}: { cloudUsage?: CloudUsage | null; enabled?: boolean } = {},
) {
	const router = createTRPCRouter({
		cloud: cloudRouterWith({
			db,
			cloudUsage: async () => cloudUsage,
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
		expect(open?.metrics.gbHours).toBe(16);
	});

	test("a signed-in person outside the organization is FORBIDDEN", async () => {
		await expect(
			caller(BEN).usage.query({ range: NOVEMBER }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});

	test("a member cannot group by person", async () => {
		await expect(
			caller(SAM).usage.query({ range: NOVEMBER, groupBy: "user" }),
		).rejects.toMatchObject({ code: "FORBIDDEN" });
	});
});

test("a cursor that does not decode is BAD_REQUEST", async () => {
	const owner = caller(MAYA);
	const encoded = (keyset: object) =>
		Buffer.from(JSON.stringify(keyset)).toString("base64url");
	for (const cursor of [
		"not-a-cursor",
		encoded({ sort: "gbMinutes", value: "1 or 1=1", key: "" }),
		encoded({ sort: "key", key: "2026-11-17" }),
	]) {
		await expect(
			owner.usage.query({ range: NOVEMBER, groupBy: "workspace", cursor }),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
	}
	await expect(
		owner.boots.list({
			range: NOVEMBER,
			cursor: encoded({ sort: "startedAt", value: "yesterday", key: "boot_1" }),
		}),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	await expect(
		owner.periods.list({ cursor: "2026-10-02" }),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
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
	for (const groupBy of ["workspace", "day"] as const) {
		expect(
			await pages((cursor) =>
				owner.usage.query({ range: NOVEMBER, groupBy, limit: 1, cursor }),
			),
		).toEqual((await owner.usage.query({ range: NOVEMBER, groupBy })).items);
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

test("with the flag off every procedure is FORBIDDEN", async () => {
	const off = caller(MAYA, { enabled: false });
	for (const call of [
		() => off.usage.query({ range: "7d" }),
		() => off.boots.list({ range: "7d" }),
		() => off.periods.list({}),
	]) {
		await expect(call()).rejects.toMatchObject({ code: "FORBIDDEN" });
	}
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
	const owner = caller(MAYA, { cloudUsage: null });
	expect(await owner.periods.list({})).toEqual({ items: [], nextCursor: null });
	await expect(
		owner.usage.query({ range: { period: "current" } }),
	).rejects.toMatchObject({ code: "BAD_REQUEST" });
	const usage = await owner.usage.query({ range: NOVEMBER });
	expect(usage.total).toMatchObject({ gbHours: 34, usageUsd: null });
});
