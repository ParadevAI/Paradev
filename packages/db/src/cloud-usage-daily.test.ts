import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, isNull, sql } from "drizzle-orm";
import {
	CHECKOUT,
	MAYA,
	ORG,
	SAM,
	seedCloudUsage,
} from "../test/cloud-usage-fixture";
import { recordUsageEvent } from "./cloud-usage-events";
import { BILLED_FEATURE } from "./cloud-usage-query";
import { cloudUsageDaily, cloudUsageEvents } from "./schema";

let db: Awaited<ReturnType<typeof seedCloudUsage>>;

beforeAll(async () => {
	db = await seedCloudUsage();
});

type Row = {
	organization_id: string;
	day: string;
	user_id: string | null;
	vcpus: number;
	gb_minutes: string;
	seconds: string;
	events: number;
};

const asNumbers = (rows: Row[]) =>
	rows.map((row) => ({
		...row,
		gb_minutes: Number(row.gb_minutes),
		seconds: Number(row.seconds),
	}));

async function rollup() {
	const { rows } = await db.execute<Row>(sql`
		select organization_id, day::text, user_id, vcpus, gb_minutes, seconds, events
		from cloud_usage_daily where events <> 0
		order by 1, 2, 3, 4`);
	return asNumbers(rows);
}

async function fromEvents() {
	const { rows } = await db.execute<Row>(sql`
		select e.organization_id, (e.sent_at at time zone 'America/Los_Angeles')::date::text as day, e.user_id, b.vcpus,
			sum(e.amount) as gb_minutes, sum(extract(epoch from e.window_to - e.window_from)) as seconds,
			count(*)::int as events
		from cloud_usage_events e join cloud_workspace_boots b on b.id = e.boot_id
		where e.feature = ${BILLED_FEATURE} and e.sent_at is not null
		group by 1, 2, 3, 4
		order by 1, 2, 3, 4`);
	return asNumbers(rows);
}

const dayOf = (day: string, userId: string | null = MAYA) =>
	db
		.select({
			gbMinutes: cloudUsageDaily.gbMinutes,
			seconds: cloudUsageDaily.seconds,
			events: cloudUsageDaily.events,
		})
		.from(cloudUsageDaily)
		.where(
			and(
				eq(cloudUsageDaily.organizationId, ORG),
				eq(cloudUsageDaily.day, day),
				userId === null
					? isNull(cloudUsageDaily.userId)
					: eq(cloudUsageDaily.userId, userId),
			),
		);

const event = (
	lockSeq: number,
	from: string,
	to: string,
	amount: string,
	feature: "box_gb_minutes" | "active_cpu_minutes" = BILLED_FEATURE,
) => ({
	bootId: "boot_1",
	lockSeq,
	feature,
	organizationId: ORG,
	cloudWorkspaceId: CHECKOUT,
	userId: MAYA,
	windowFrom: new Date(from),
	windowTo: new Date(to),
	amount,
	sentAt: new Date(to),
});

const sent = (sentAt: string) =>
	db
		.update(cloudUsageEvents)
		.set({ sentAt: new Date(sentAt) })
		.where(
			and(
				eq(cloudUsageEvents.bootId, "boot_4"),
				eq(cloudUsageEvents.lockSeq, 1),
			),
		);

describe("cloud_usage_daily trigger", () => {
	test("sums billed events by organization, billing day of sent_at, user and size", async () => {
		expect(await rollup()).toEqual(await fromEvents());

		await recordUsageEvent(
			db,
			event(20, "2026-11-14T07:00Z", "2026-11-14T07:30Z", "120"),
		);
		await recordUsageEvent(
			db,
			event(20, "2026-11-14T07:00Z", "2026-11-14T07:31Z", "124"),
		);
		await recordUsageEvent(
			db,
			event(21, "2026-11-14T07:30Z", "2026-11-14T08:10Z", "160"),
		);
		await recordUsageEvent(
			db,
			event(
				20,
				"2026-11-14T07:00Z",
				"2026-11-14T07:30Z",
				"30",
				"active_cpu_minutes",
			),
		);

		expect(await dayOf("2026-11-13")).toEqual([
			{ gbMinutes: "120.000000", seconds: "1800.000000", events: 1 },
		]);
		expect(await dayOf("2026-11-14")).toEqual([
			{ gbMinutes: "160.000000", seconds: "2400.000000", events: 1 },
		]);
		expect(await rollup()).toEqual(await fromEvents());
	});

	test("the billing day starts at 07:00 UTC in July and 08:00 UTC in November", async () => {
		await recordUsageEvent(
			db,
			event(24, "2026-07-15T06:30Z", "2026-07-15T06:59Z", "58"),
		);
		await recordUsageEvent(
			db,
			event(25, "2026-07-15T06:59Z", "2026-07-15T07:01Z", "4"),
		);

		expect(await dayOf("2026-07-14")).toEqual([
			{ gbMinutes: "58.000000", seconds: "1740.000000", events: 1 },
		]);
		expect(await dayOf("2026-07-15")).toEqual([
			{ gbMinutes: "4.000000", seconds: "120.000000", events: 1 },
		]);
	});

	test("events with no user share one row per day", async () => {
		await recordUsageEvent(db, {
			...event(22, "2026-11-14T13:00Z", "2026-11-14T13:20Z", "80"),
			userId: null,
		});
		await recordUsageEvent(db, {
			...event(23, "2026-11-14T13:20Z", "2026-11-14T13:40Z", "80"),
			userId: null,
		});

		expect(await dayOf("2026-11-14", null)).toEqual([
			{ gbMinutes: "160.000000", seconds: "2400.000000", events: 2 },
		]);
		expect(await rollup()).toEqual(await fromEvents());
	});

	test("an update that sets sent_at counts the event, and a later one moves it across midnight", async () => {
		await sent("2026-11-17T07:59Z");
		expect(await dayOf("2026-11-16", SAM)).toEqual([
			{ gbMinutes: "960.000000", seconds: "3600.000000", events: 1 },
		]);

		await sent("2026-11-17T08:01Z");
		expect(await dayOf("2026-11-16", SAM)).toEqual([
			{ gbMinutes: "0.000000", seconds: "0.000000", events: 0 },
		]);
		expect(await dayOf("2026-11-17", SAM)).toEqual([
			{ gbMinutes: "960.000000", seconds: "3600.000000", events: 1 },
		]);
		expect(await rollup()).toEqual(await fromEvents());
	});

	test("the backfill runbook's undo takes its rows back out", async () => {
		const start = new Date();
		await db
			.insert(cloudUsageEvents)
			.values([
				event(30, "2026-11-15T19:00Z", "2026-11-15T19:40Z", "320"),
				event(31, "2026-11-15T19:40Z", "2026-11-15T19:50Z", "80"),
			]);
		expect(await dayOf("2026-11-15")).toEqual([
			{ gbMinutes: "400.000000", seconds: "3000.000000", events: 2 },
		]);

		await db.execute(
			sql`delete from cloud_usage_events where created_at >= ${start.toISOString()} and sent_at < ${start.toISOString()}`,
		);

		expect(await dayOf("2026-11-15")).toEqual([
			{ gbMinutes: "0.000000", seconds: "0.000000", events: 0 },
		]);
		expect(await rollup()).toEqual(await fromEvents());
	});

	test("the day does not depend on the session's time zone", async () => {
		await db.$client.transaction(async (tx) => {
			await tx.exec("set local time zone 'Asia/Kolkata'");
			await tx.query(
				`insert into cloud_usage_events (boot_id, lock_seq, feature, organization_id, cloud_workspace_id, user_id, window_from, window_to, amount, sent_at)
				values ('boot_1', 50, $1, $2, $3, $4, '2026-11-18T07:00Z', '2026-11-18T07:30Z', 240, '2026-11-18T07:30Z')`,
				[BILLED_FEATURE, ORG, CHECKOUT, MAYA],
			);
		});
		expect(await dayOf("2026-11-17")).toEqual([
			{ gbMinutes: "240.000000", seconds: "1800.000000", events: 1 },
		]);
	});

	test("an error inside the trigger warns and the event insert still commits", async () => {
		const notices: string[] = [];
		await db.$client.transaction(async (tx) => {
			await tx.exec(
				"alter table cloud_usage_daily add constraint broken check (events < 0) not valid",
			);
			await tx.query(
				`insert into cloud_usage_events (boot_id, lock_seq, feature, organization_id, cloud_workspace_id, user_id, window_from, window_to, amount, sent_at)
				values ('boot_1', 40, $1, $2, $3, $4, '2026-11-16T19:00Z', '2026-11-16T19:30Z', 240, '2026-11-16T19:30Z')`,
				[BILLED_FEATURE, ORG, CHECKOUT, MAYA],
				{ onNotice: (notice) => notices.push(notice.message ?? "") },
			);
			const saved = await tx.query(
				"select count(*)::int as n from cloud_usage_events where boot_id = 'boot_1' and lock_seq = 40",
			);
			expect(saved.rows).toEqual([{ n: 1 }]);
			const counted = await tx.query(
				"select count(*)::int as n from cloud_usage_daily where day = '2026-11-16' and user_id = $1",
				[MAYA],
			);
			expect(counted.rows).toEqual([{ n: 0 }]);
			await tx.rollback();
		});
		expect(notices).toEqual([
			`cloud_usage_daily not updated: organization ${ORG} day 2026-11-16 sqlstate 23514`,
		]);
	});
});
