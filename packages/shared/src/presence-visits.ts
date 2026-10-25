import type { PresenceVisitor } from "./page-presence";
import type { SqlLike } from "./page-storage-records";

/** Who has opened a page or workspace, kept in its hub's SQLite. */
export class PresenceVisits {
	constructor(private readonly sql: SqlLike) {}

	ensureSchema(): void {
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS visits (
				user_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				image TEXT,
				first_seen_at INTEGER NOT NULL,
				last_seen_at INTEGER NOT NULL
			)`,
		);
	}

	/** A null name keeps the name and image already recorded. */
	record(
		visit: { userId: string; name: string | null; image: string | null },
		now: number,
	): void {
		this.sql.exec(
			`INSERT INTO visits (user_id, name, image, first_seen_at, last_seen_at)
			 VALUES (?, coalesce(?, 'Someone'), ?, ?, ?)
			 ON CONFLICT (user_id) DO UPDATE SET
				name = CASE WHEN ? IS NULL THEN visits.name ELSE excluded.name END,
				image = CASE WHEN ? IS NULL THEN visits.image ELSE excluded.image END,
				last_seen_at = excluded.last_seen_at`,
			visit.userId,
			visit.name,
			visit.image,
			now,
			now,
			visit.name,
			visit.name,
		);
	}

	touch(userId: string, now: number): void {
		this.sql.exec(
			"UPDATE visits SET last_seen_at = ? WHERE user_id = ?",
			now,
			userId,
		);
	}

	recent(limit: number): Omit<PresenceVisitor, "active">[] {
		return this.sql
			.exec<{
				user_id: string;
				name: string;
				image: string | null;
				last_seen_at: number;
			}>(
				"SELECT user_id, name, image, last_seen_at FROM visits ORDER BY last_seen_at DESC LIMIT ?",
				limit,
			)
			.toArray()
			.map((row) => ({
				userId: row.user_id,
				name: row.name,
				image: row.image,
				lastSeenAt: row.last_seen_at,
			}));
	}
}
