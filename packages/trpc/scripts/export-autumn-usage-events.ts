import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import type { AutumnUsageEvent } from "@superset/db/cloud-usage-autumn";

/**
 * Writes every box_gb_minutes and active_cpu_minutes event in live Autumn to a JSON-lines file,
 * one event per line in the shape of Autumn's `events.list`, for
 * backfill-cloud-usage-events.ts and check-cloud-usage-events.ts.
 *
 * It reads Autumn's SQL endpoint through the Autumn plugin of the superset CLI, because the live
 * Autumn key exists only in the deploy secrets. Read-only.
 *
 * Usage: bun run packages/trpc/scripts/export-autumn-usage-events.ts --out FILE
 */

const PAGE_SIZE = 1500;

const { values } = parseArgs({ options: { out: { type: "string" } } });
if (!values.out) {
	console.error("Pass --out FILE");
	process.exit(64);
}
const out = values.out;

type Row = [
	id: string,
	micros: string,
	featureId: string,
	customerId: string,
	value: string,
	bootId: string | null,
	lockSeq: string | null,
	workspaceId: string | null,
	userId: string | null,
	correction: string | null,
];

function query(sql: string): Row[] {
	const stdout = execFileSync(
		"superset",
		[
			"mcp",
			"call-tool",
			"queryEvents",
			JSON.stringify({
				intent:
					"Export Autumn cloud usage events for the M5a usage events backfill.",
				request: { sql },
			}),
			"--plugin",
			"autumn",
			"--json",
		],
		{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	);
	const reply = JSON.parse(stdout) as {
		content: { text: string }[];
		isError: boolean;
	};
	const text = reply.content[0]?.text ?? "";
	if (reply.isError) throw new Error(text);
	const page = JSON.parse(text) as { rows: Row[]; truncated: boolean };
	if (page.truncated)
		throw new Error("Autumn truncated a page; lower PAGE_SIZE");
	return page.rows;
}

function quoted(value: string): string {
	return `'${value.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`;
}

writeFileSync(out, "");
let after: { micros: string; id: string } | null = null;
let exported = 0;
for (;;) {
	const rows = query(`
		SELECT id, toString(toUnixTimestamp64Micro(timestamp)), event_name, customer_id, toString(value),
			properties.bootId::Nullable(String), properties.lockSeq::Nullable(String),
			properties.workspaceId::Nullable(String), properties.userId::Nullable(String),
			properties.correction::Nullable(String)
		FROM events
		WHERE event_name IN ('box_gb_minutes', 'active_cpu_minutes')
			${after ? `AND (toUnixTimestamp64Micro(timestamp), id) > (${after.micros}, ${quoted(after.id)})` : ""}
		ORDER BY toUnixTimestamp64Micro(timestamp), id
		LIMIT ${PAGE_SIZE}`);
	const lines = rows.map((row) => {
		const [id, micros, featureId, customerId, value, ...rest] = row;
		const [bootId, lockSeq, workspaceId, userId, correction] = rest;
		const properties = Object.fromEntries(
			Object.entries({
				bootId,
				lockSeq,
				workspaceId,
				userId,
				correction,
			}).filter(([, property]) => property !== null),
		);
		const event: AutumnUsageEvent = {
			id,
			timestamp: Number(micros) / 1000,
			featureId,
			customerId,
			value: Number(value),
			properties,
		};
		return `${JSON.stringify(event)}\n`;
	});
	appendFileSync(out, lines.join(""));
	exported += rows.length;
	const last = rows.at(-1);
	if (!last || rows.length < PAGE_SIZE) break;
	after = { micros: last[1], id: last[0] };
	console.error(`${exported} events`);
}
console.log(JSON.stringify({ out, exported }));
