import { beforeAll, describe, expect, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import {
	CHECKOUT,
	MAYA,
	ORG,
	seedCloudUsage,
} from "../test/cloud-usage-fixture";
import { recordUsageEvent } from "./cloud-usage-events";
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
		order by organization_id, day, user_id, vcpus`);
	return asNumbers(rows);
}

async function fromEvents() {
	const { rows } = await db.execute<Row>(sql`
		select e.organization_id, (e.sent_at at time zone 'UTC')::date::text as day, e.user_id, b.vcpus,
			sum(e.amount) as gb_minutes, sum(extract(epoch from e.window_to - e.window_from)) as seconds,
			count(*)::int as events
		from cloud_usage_events e join cloud_workspace_boots b on b.id = e.boot_id
		where e.feature = 'box_gb_minutes' and e.sent_at is not null
		group by 1, 2, 3, 4
		order by 1, 2, 3, 4`);
	return asNumbers(rows);
}

const dayOf = (day: string) =>
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
				eq(cloudUsageDaily.userId, MAYA),
			),
		);

const event = (
	lockSeq: number,
	from: string,
	to: string,
	amount: string,
	feature: "box_gb_minutes" | "active_cpu_minutes" = "box_gb_minutes",
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

describe("cloud_usage_daily trigger", () => {
	test("sums billed events by organization, UTC day of sent_at, user and size", async () => {
		expect(await rollup()).toEqual(await fromEvents());

		await recordUsageEvent(
			db,
			event(20, "2026-11-13T23:40Z", "2026-11-14T00:10Z", "120"),
		);
		await recordUsageEvent(
			db,
			event(20, "2026-11-13T23:40Z", "2026-11-14T00:11Z", "124"),
		);
		await recordUsageEvent(
			db,
			event(
				20,
				"2026-11-13T23:40Z",
				"2026-11-14T00:10Z",
				"30",
				"active_cpu_minutes",
			),
		);

		expect(await dayOf("2026-11-13")).toEqual([]);
		expect(await dayOf("2026-11-14")).toEqual([
			{ gbMinutes: "120.000000", seconds: "1800.000000", events: 1 },
		]);
		expect(await rollup()).toEqual(await fromEvents());
	});

	test("the backfill runbook's undo takes its rows back out", async () => {
		const start = new Date();
		await db
			.insert(cloudUsageEvents)
			.values([
				event(30, "2026-11-15T09:00Z", "2026-11-15T10:00Z", "480"),
				event(31, "2026-11-15T10:00Z", "2026-11-15T10:30Z", "240"),
			]);
		expect(await dayOf("2026-11-15")).toEqual([
			{ gbMinutes: "720.000000", seconds: "5400.000000", events: 2 },
		]);

		await db.execute(
			sql`delete from cloud_usage_events where created_at >= ${start.toISOString()} and sent_at < ${start.toISOString()}`,
		);

		expect(await dayOf("2026-11-15")).toEqual([
			{ gbMinutes: "0.000000", seconds: "0.000000", events: 0 },
		]);
		expect(await rollup()).toEqual(await fromEvents());
	});

	test("an error inside the trigger warns and the event insert still commits", async () => {
		const notices: string[] = [];
		await db.$client.transaction(async (tx) => {
			await tx.exec(
				"alter table cloud_usage_daily add constraint broken check (events < 0) not valid",
			);
			await tx.query(
				`insert into cloud_usage_events (boot_id, lock_seq, feature, organization_id, cloud_workspace_id, user_id, window_from, window_to, amount, sent_at)
				values ('boot_1', 40, 'box_gb_minutes', $1, $2, $3, '2026-11-16T09:00Z', '2026-11-16T09:30Z', 240, '2026-11-16T09:30Z')`,
				[ORG, CHECKOUT, MAYA],
				{ onNotice: (notice) => notices.push(notice.message ?? "") },
			);
			const saved = await tx.query(
				"select count(*)::int as n from cloud_usage_events where boot_id = 'boot_1' and lock_seq = 40",
			);
			expect(saved.rows).toEqual([{ n: 1 }]);
			const counted = await tx.query(
				"select count(*)::int as n from cloud_usage_daily where day = '2026-11-16'",
			);
			expect(counted.rows).toEqual([{ n: 0 }]);
			await tx.rollback();
		});
		expect(notices).toEqual([
			`cloud_usage_daily not updated: organization ${ORG} day 2026-11-16 sqlstate 23514`,
		]);
	});
});
