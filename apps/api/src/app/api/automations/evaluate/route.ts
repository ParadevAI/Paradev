import { dbWs } from "@superset/db/client";
import {
	automations,
	automationTriggers,
	type TriggerConfig,
} from "@superset/db/schema";
import { nextOccurrenceAfter } from "@superset/shared/rrule";
import { Client, Receiver } from "@upstash/qstash";
import { and, eq, lte, sql } from "drizzle-orm";

import { env } from "@/env";

export const dynamic = "force-dynamic";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});
const receiver = new Receiver({
	currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
	nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
});

const BATCH_SIZE = 2000;

function bucketToMinute(d: Date): Date {
	const copy = new Date(d.getTime());
	copy.setUTCSeconds(0, 0);
	return copy;
}

/** Null when the config can't drive a schedule, so the caller can fall back. */
function scheduleFromConfig(
	config: TriggerConfig | null,
): { rrule: string; dtstart: Date; timezone: string } | null {
	// The kind-matches-config CHECK passes for jsonb `null` (SQL NULL = NULL is
	// not false), so the column can hold something the type says it can't.
	if (config === null || typeof config !== "object") return null;
	if (config.kind !== "schedule") return null;
	if (!config.rrule || !config.timezone) return null;
	const dtstart = new Date(config.dtstart);
	if (Number.isNaN(dtstart.getTime())) return null;
	return { rrule: config.rrule, dtstart, timezone: config.timezone };
}

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const signature = request.headers.get("upstash-signature");
	if (!signature) {
		return Response.json({ error: "Missing signature" }, { status: 401 });
	}

	const valid = await receiver.verify({
		body,
		signature,
		url: `${env.NEXT_PUBLIC_API_URL}/api/automations/evaluate`,
	});
	if (!valid) {
		return Response.json({ error: "Invalid signature" }, { status: 401 });
	}

	const now = new Date();

	// Lazy repair: give any automation without a schedule trigger one, built from
	// its legacy columns. This is what lets the dispatcher read triggers safely
	// without depending on the backfill having been complete, and it self-heals
	// anything old code creates during a deploy or a rollback.
	await dbWs.execute(sql`
		INSERT INTO automation_triggers
			(automation_id, organization_id, kind, config, enabled, next_run_at)
		SELECT
			a.id, a.organization_id, 'schedule',
			jsonb_build_object(
				'kind', 'schedule',
				'rrule', a.rrule,
				'dtstart', to_char(a.dtstart AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
				'timezone', a.timezone
			),
			a.enabled, a.next_run_at
		FROM automations a
		WHERE NOT EXISTS (
			SELECT 1 FROM automation_triggers t
			WHERE t.automation_id = a.id AND t.kind = 'schedule'
		)
		ON CONFLICT DO NOTHING
	`);

	const rows = await dbWs
		.select({
			automationId: automations.id,
			nextRunAt: automationTriggers.nextRunAt,
			config: automationTriggers.config,
			legacyRrule: automations.rrule,
			legacyDtstart: automations.dtstart,
			legacyTimezone: automations.timezone,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.kind, "schedule"),
				eq(automationTriggers.enabled, true),
				eq(automations.enabled, true),
				lte(automationTriggers.nextRunAt, now),
			),
		)
		.orderBy(automationTriggers.nextRunAt)
		.limit(BATCH_SIZE);

	// `next_run_at <= now` already excludes nulls; this just tells the compiler.
	const due = rows.filter(
		(row): row is (typeof rows)[number] & { nextRunAt: Date } =>
			row.nextRunAt !== null,
	);

	if (due.length === 0) {
		return Response.json({ enqueued: 0 });
	}

	await qstash.batchJSON(
		due.map((row) => {
			const scheduledFor = bucketToMinute(row.nextRunAt);
			return {
				url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${row.automationId}`,
				body: {
					automationId: row.automationId,
					scheduledFor: scheduledFor.toISOString(),
				},
				deduplicationId: `${row.automationId}_${scheduledFor.getTime()}`,
				retries: 2,
				failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
			};
		}),
	);

	let configFallbacks = 0;
	const advanceResults = await Promise.allSettled(
		due.map(async (row) => {
			const fromConfig = scheduleFromConfig(row.config);
			if (!fromConfig) configFallbacks++;
			const schedule = fromConfig ?? {
				rrule: row.legacyRrule,
				dtstart: row.legacyDtstart,
				timezone: row.legacyTimezone,
			};

			const next = nextOccurrenceAfter({
				...schedule,
				after: row.nextRunAt,
			});
			const patch = next ? { nextRunAt: next } : { enabled: false };

			await dbWs
				.update(automationTriggers)
				.set(patch)
				.where(
					and(
						eq(automationTriggers.automationId, row.automationId),
						eq(automationTriggers.kind, "schedule"),
					),
				);

			// The legacy columns stay written until they drop, so reverting this
			// deploy is a clean revert rather than a stranded automation.
			await dbWs
				.update(automations)
				.set(patch)
				.where(eq(automations.id, row.automationId));
		}),
	);

	// Should be 0. A non-zero count means a trigger's config lost its recurrence
	// and the legacy columns carried the run instead; those columns drop next, so
	// this has to be silent before that lands.
	if (configFallbacks > 0) {
		console.error(
			"[automations/evaluate] schedule config unusable, fell back to automations columns",
			{ count: configFallbacks },
		);
	}

	// next_run_at advance failures are recoverable (next tick re-enqueues and
	// QStash dedup absorbs the duplicate), but a persistent failure would
	// hide itself without this log.
	const advanceFailures = advanceResults.flatMap((result, index) => {
		if (result.status !== "rejected") return [];
		return [{ automationId: due[index]?.automationId, reason: result.reason }];
	});
	if (advanceFailures.length > 0) {
		console.error(
			"[automations/evaluate] advanceNextRun failures",
			advanceFailures,
		);
	}

	return Response.json({
		enqueued: due.length,
		advanceFailed: advanceFailures.length,
	});
}
