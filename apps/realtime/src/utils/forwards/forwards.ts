import type { SqlLike } from "@superset/shared/page-storage-records";
import {
	MAX_WORKSPACE_FORWARDS,
	type WorkspaceForward,
} from "@superset/shared/realtime";

type Reported = { port: number; localPort: number };

function isPort(value: unknown): value is number {
	return (
		Number.isInteger(value) &&
		(value as number) >= 1 &&
		(value as number) <= 65535
	);
}

export function parseForwardsReport(message: string): Reported[] | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(message);
	} catch {
		return null;
	}
	if (
		!parsed ||
		typeof parsed !== "object" ||
		(parsed as { type?: unknown }).type !== "forwards" ||
		!Array.isArray((parsed as { forwards?: unknown }).forwards)
	) {
		return null;
	}
	const byPort = new Map<number, Reported>();
	for (const entry of (parsed as { forwards: unknown[] }).forwards) {
		const { port, localPort } = (entry ?? {}) as Record<string, unknown>;
		if (!isPort(port) || !isPort(localPort)) return null;
		byPort.set(port, { port, localPort });
	}
	if (byPort.size > MAX_WORKSPACE_FORWARDS) return null;
	return [...byPort.values()];
}

/** In SQLite, not on the socket: a hibernating socket's state is capped at 2 KB. */
export class WorkspaceForwards {
	constructor(private readonly sql: SqlLike) {}

	ensureSchema(): void {
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS forwards (
				connection_id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL,
				name TEXT NOT NULL,
				image TEXT,
				forwards TEXT NOT NULL
			)`,
		);
	}

	report(
		connectionId: string,
		user: { id: string; name: string; image: string | null },
		reported: Reported[],
		now: number,
	): void {
		const previous = new Map(
			this.read(connectionId).map((entry) => [entry.port, entry]),
		);
		const forwards = reported.map(({ port, localPort }) => {
			const kept = previous.get(port);
			return {
				port,
				localPort,
				since: kept && kept.localPort === localPort ? kept.since : now,
			};
		});
		const unchanged =
			previous.size === forwards.length &&
			forwards.every((entry) => {
				const kept = previous.get(entry.port);
				return (
					kept?.localPort === entry.localPort && kept.since === entry.since
				);
			});
		if (unchanged) return;
		this.sql.exec(
			`INSERT INTO forwards (connection_id, user_id, name, image, forwards)
			 VALUES (?, ?, ?, ?, ?)
			 ON CONFLICT (connection_id) DO UPDATE SET forwards = excluded.forwards`,
			connectionId,
			user.id,
			user.name,
			user.image,
			JSON.stringify(forwards),
		);
	}

	remove(connectionId: string): void {
		this.sql.exec("DELETE FROM forwards WHERE connection_id = ?", connectionId);
	}

	/** Prunes connections the runtime dropped without a close (a sleeping laptop). */
	list(liveConnectionIds: Set<string>): WorkspaceForward[] {
		const rows = this.sql
			.exec<{
				connection_id: string;
				user_id: string;
				name: string;
				image: string | null;
				forwards: string;
			}>("SELECT connection_id, user_id, name, image, forwards FROM forwards")
			.toArray();
		const out: WorkspaceForward[] = [];
		for (const row of rows) {
			if (!liveConnectionIds.has(row.connection_id)) {
				this.remove(row.connection_id);
				continue;
			}
			const user = { id: row.user_id, name: row.name, image: row.image };
			for (const entry of JSON.parse(row.forwards) as WorkspaceForward[]) {
				out.push({ ...entry, user });
			}
		}
		return out.sort(
			(a, b) => a.port - b.port || a.user.name.localeCompare(b.user.name),
		);
	}

	private read(
		connectionId: string,
	): { port: number; localPort: number; since: number }[] {
		const [row] = this.sql
			.exec<{ forwards: string }>(
				"SELECT forwards FROM forwards WHERE connection_id = ?",
				connectionId,
			)
			.toArray();
		return row ? JSON.parse(row.forwards) : [];
	}
}
