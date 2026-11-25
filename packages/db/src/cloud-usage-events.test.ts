import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import {
	CHECKOUT,
	MAYA,
	ORG,
	seedCloudUsage,
} from "../test/cloud-usage-fixture";
import {
	clearPendingUsage,
	recordedUsage,
	recordUsageEvent,
} from "./cloud-usage-events";
import { cloudUsageEvents, cloudWorkspaceBoots } from "./schema";

let db: Awaited<ReturnType<typeof seedCloudUsage>>;

beforeAll(async () => {
	db = await seedCloudUsage();
});

const LOCK_SEQ = 41;
const send = (from: string, to: string, amount: string) => ({
	bootId: "boot_1",
	lockSeq: LOCK_SEQ,
	feature: "box_gb_minutes" as const,
	organizationId: ORG,
	cloudWorkspaceId: CHECKOUT,
	userId: MAYA,
	windowFrom: new Date(from),
	windowTo: new Date(to),
	amount,
	sentAt: new Date(to),
});
const rows = () =>
	db
		.select({
			amount: cloudUsageEvents.amount,
			windowTo: cloudUsageEvents.windowTo,
		})
		.from(cloudUsageEvents)
		.where(
			and(
				eq(cloudUsageEvents.bootId, "boot_1"),
				eq(cloudUsageEvents.lockSeq, LOCK_SEQ),
			),
		)
		.orderBy(cloudUsageEvents.windowFrom);

describe("recordUsageEvent", () => {
	test("a retried window writes no second row; the next window under the same lock writes its own", async () => {
		await recordUsageEvent(
			db,
			send("2026-11-10T09:00Z", "2026-11-10T09:30Z", "60.333333"),
		);
		await recordUsageEvent(
			db,
			send("2026-11-10T09:00Z", "2026-11-10T09:31Z", "62"),
		);
		await recordUsageEvent(
			db,
			send("2026-11-10T09:30Z", "2026-11-10T10:00Z", "60"),
		);
		expect(await rows()).toEqual([
			{ amount: "60.333333", windowTo: new Date("2026-11-10T09:30Z") },
			{ amount: "60.000000", windowTo: new Date("2026-11-10T10:00Z") },
		]);
	});
});

const kept = (lockSeq: number, amount: string) => ({
	bootId: "boot_2",
	lockSeq,
	feature: "box_gb_minutes" as const,
	organizationId: ORG,
	cloudWorkspaceId: CHECKOUT,
	userId: MAYA,
	windowFrom: "2026-11-12T08:00:00.000Z",
	windowTo: "2026-11-12T08:01:00.000Z",
	amount,
	sentAt: "2026-11-12T08:02:00.000Z",
});
const keep = (events: ReturnType<typeof kept>[] | null) =>
	db
		.update(cloudWorkspaceBoots)
		.set({ pendingUsageEvents: events })
		.where(eq(cloudWorkspaceBoots.id, "boot_2"));
const keptOnBoot = async () =>
	(
		await db
			.select({ events: cloudWorkspaceBoots.pendingUsageEvents })
			.from(cloudWorkspaceBoots)
			.where(eq(cloudWorkspaceBoots.id, "boot_2"))
	)[0]?.events;

describe("recordedUsage", () => {
	test("lists the written rows and the rows kept on a boot, so a kept lock counts as recorded", async () => {
		await keep([kept(7, "16"), kept(8, "4.5")]);
		const recorded = await recordedUsage(db);
		expect(recorded).toContainEqual({
			bootId: "boot_2",
			lockSeq: 7,
			feature: "box_gb_minutes",
			amount: "16",
			sentAt: new Date("2026-11-12T08:02:00.000Z"),
		});
		expect(recorded.filter((row) => row.bootId === "boot_2")).toHaveLength(2);
		expect(
			recorded.filter((row) => row.bootId === "boot_1").length,
		).toBeGreaterThan(0);
		await keep(null);
	});

	test("a kept row that is also written is listed once", async () => {
		const written = {
			...kept(1, "480"),
			bootId: "boot_1",
			windowFrom: "2026-11-10T09:00:00.000Z",
		};
		const before = (await recordedUsage(db)).length;
		await keep([written]);
		expect(await recordedUsage(db)).toHaveLength(before);
		await keep(null);
	});
});

describe("clearPendingUsage", () => {
	test("clears the list it wrote, and leaves a list a settle added to meanwhile", async () => {
		const written = [kept(7, "16")];
		await keep([...written, kept(8, "4.5")]);
		await clearPendingUsage(db, "boot_2", written);
		expect(await keptOnBoot()).toEqual([kept(7, "16"), kept(8, "4.5")]);

		await keep(written);
		await clearPendingUsage(db, "boot_2", written);
		expect(await keptOnBoot()).toBeNull();
	});
});
