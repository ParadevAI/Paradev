import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import {
	CHECKOUT,
	MAYA,
	ORG,
	seedCloudUsage,
} from "../test/cloud-usage-fixture";
import { recordUsageEvent } from "./cloud-usage-events";
import { cloudUsageEvents } from "./schema";

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
