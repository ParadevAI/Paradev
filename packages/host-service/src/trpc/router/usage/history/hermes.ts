/**
 * Hermes Agent usage. `<HERMES_HOME>/state.db` (SQLite, WAL) holds one
 * `sessions` row per session with its token totals, and
 * `session_model_usage` splits those totals per model. Each profile
 * (`<root>/profiles/<name>`) is its own HERMES_HOME with its own database.
 * Opened read-only — Hermes may hold the database concurrently. Kept apart
 * from the Bun unit suite because better-sqlite3 is a Node-only native binding.
 */
import { statSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import {
	type HermesModelUsageRow,
	type HermesSessionRow,
	hermesRowsToEntries,
} from "./hermes-rows";
import {
	MAX_SQL_TEXT_LENGTH,
	rememberLabel,
	type UsageLogEntry,
} from "./parse";
import type { SqliteStates } from "./sqlite-tail";

const ACTIVITY_AT =
	"MAX(started_at, COALESCE(ended_at, 0), COALESCE(last_activity_at, 0))";

interface HermesScan {
	signature: string;
	entries: UsageLogEntry[];
	labels: Record<string, string>;
}

function fileSignature(path: string): string {
	try {
		const { ino, size, mtimeMs } = statSync(path);
		return `${ino}:${size}:${mtimeMs}`;
	} catch {
		return "-";
	}
}

function appendScan(
	scan: HermesScan,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	for (const entry of scan.entries) out.push(entry);
	for (const [id, label] of Object.entries(scan.labels)) {
		rememberLabel(sessionLabels, id, label);
	}
}

/** Returns 1 when the database was scanned, 0 when absent/unreadable. Totals
 * change in place, so a scan is reused until `state.db` or its WAL changes. */
export function collectHermesEntries(
	hermesHome: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	states?: SqliteStates,
): number {
	const dbPath = join(hermesHome, "state.db");
	const stateKey = `hermes:${dbPath}`;
	const signature = `${cutoffMs}|${fileSignature(dbPath)}|${fileSignature(`${dbPath}-wal`)}`;
	const cached = states?.get(stateKey) as HermesScan | undefined;
	if (cached?.signature === signature) {
		appendScan(cached, out, sessionLabels);
		return 1;
	}
	let db: InstanceType<typeof Database> | null = null;
	try {
		const conn = new Database(dbPath, {
			readonly: true,
			fileMustExist: true,
		});
		db = conn;
		const cutoffSeconds = Math.floor(cutoffMs / 1000);
		const hasModelUsage = !!conn
			.prepare(
				"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'session_model_usage'",
			)
			.get();
		// One read transaction: Hermes may write between the two queries, and
		// the remainder must subtract model rows from the same session totals.
		const readSnapshot = conn.transaction(() => ({
			sessions: conn
				.prepare(
					`SELECT id, model, cwd, substr(title, 1, ${MAX_SQL_TEXT_LENGTH}) AS title, ${ACTIVITY_AT} AS activity_at,
					        input_tokens, output_tokens, cache_read_tokens,
					        cache_write_tokens, reasoning_tokens,
					        estimated_cost_usd, actual_cost_usd
					 FROM sessions
					 WHERE ${ACTIVITY_AT} >= ?`,
				)
				.all(cutoffSeconds) as HermesSessionRow[],
			modelRows: hasModelUsage
				? (conn
						.prepare(
							`SELECT session_id, model, last_seen,
							        input_tokens, output_tokens, cache_read_tokens,
							        cache_write_tokens, reasoning_tokens,
							        estimated_cost_usd, actual_cost_usd
							 FROM session_model_usage
							 WHERE session_id IN (
							   SELECT id FROM sessions WHERE ${ACTIVITY_AT} >= ?
							 )`,
						)
						.all(cutoffSeconds) as HermesModelUsageRow[])
				: [],
		}));
		const { sessions, modelRows } = readSnapshot();
		const entries: UsageLogEntry[] = [];
		const labels = new Map<string, string>();
		hermesRowsToEntries(sessions, modelRows, cutoffMs, entries, labels);
		const scan: HermesScan = {
			signature,
			entries,
			labels: Object.fromEntries(labels),
		};
		states?.set(stateKey, scan);
		appendScan(scan, out, sessionLabels);
		return 1;
	} catch {
		return 0;
	} finally {
		db?.close();
	}
}
