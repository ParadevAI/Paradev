import {
	type PageStorageKeySummary,
	type PageStorageListEntry,
	type PageStorageRecord,
	type PageStorageRefusal,
	type PageStorageScope,
	pageStorageRefusal,
	pageStorageValueBytes,
	SHARED_RECORD_OWNER,
} from "./page-storage";

export type SqlValue = ArrayBuffer | string | number | null;

export interface SqlLike {
	exec<T extends Record<string, SqlValue>>(
		query: string,
		...bindings: unknown[]
	): { toArray(): T[] };
}

type NamedRow = {
	updated_by: string | null;
	value: string;
	updated_at: number;
	name: string | null;
	image: string | null;
};

function ownerFor(scope: PageStorageScope, userId: string): string {
	return scope === "shared" ? SHARED_RECORD_OWNER : userId;
}

function decode(value: string): unknown {
	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

export class PageStorageRecords {
	private ready = false;
	private hasLegacyRecords = false;

	constructor(
		private readonly sql: SqlLike,
		private readonly transaction: (fn: () => void) => void = (fn) => fn(),
	) {}

	ensureSchema(): void {
		if (this.ready) return;
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS entries (
				scope TEXT NOT NULL,
				key TEXT NOT NULL,
				user_id TEXT NOT NULL,
				created_by TEXT,
				updated_by TEXT,
				value TEXT NOT NULL,
				size_bytes INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				PRIMARY KEY (scope, key, user_id)
			)`,
		);
		const columns = this.sql
			.exec<{ name: string }>("PRAGMA table_info(entries)")
			.toArray();
		if (!columns.some((column) => column.name === "created_by")) {
			this.transaction(() => {
				this.sql.exec("ALTER TABLE entries ADD COLUMN created_by TEXT");
				this.sql.exec(
					"UPDATE entries SET created_by = CASE WHEN scope = 'shared' THEN updated_by ELSE user_id END",
				);
			});
		}
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS visits (
				user_id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				image TEXT,
				first_seen_at INTEGER NOT NULL,
				last_seen_at INTEGER NOT NULL
			)`,
		);
		const [legacy] = this.sql
			.exec<{ n: number }>(
				"SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'records'",
			)
			.toArray();
		const [moved] = this.sql
			.exec<{ n: number }>(
				"SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'entries_migrated'",
			)
			.toArray();
		this.hasLegacyRecords = (legacy?.n ?? 0) > 0;
		if (this.hasLegacyRecords && (moved?.n ?? 0) === 0) {
			this.transaction(() => {
				this.sql.exec(
					`INSERT OR IGNORE INTO entries
						(scope, key, user_id, created_by, updated_by, value, size_bytes, updated_at)
					 SELECT 'slot', key, user_id, user_id, user_id, value, size_bytes, updated_at
					 FROM records`,
				);
				this.sql.exec("CREATE TABLE entries_migrated (at INTEGER NOT NULL)");
			});
		}
		this.ready = true;
	}

	recordVisit(
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

	touchVisit(userId: string, now: number): void {
		this.sql.exec(
			"UPDATE visits SET last_seen_at = ? WHERE user_id = ?",
			now,
			userId,
		);
	}

	get(scope: PageStorageScope, key: string, userId: string): unknown {
		const [row] = this.sql
			.exec<{ value: string }>(
				"SELECT value FROM entries WHERE scope = ? AND key = ? AND user_id = ?",
				scope,
				key,
				ownerFor(scope, userId),
			)
			.toArray();
		return row ? decode(row.value) : null;
	}

	list(
		scope: PageStorageScope,
		key: string,
		viewerId: string,
	): PageStorageRecord[] {
		return this.sql
			.exec<NamedRow>(
				`SELECT e.updated_by, e.value, e.updated_at, v.name, v.image
				 FROM entries e
				 LEFT JOIN visits v ON v.user_id = e.updated_by
				 WHERE e.scope = ? AND e.key = ?
				   AND (e.scope != 'private' OR e.user_id = ?)
				 ORDER BY e.updated_at`,
				scope,
				key,
				viewerId,
			)
			.toArray()
			.map((row) => ({
				userId: row.updated_by ?? "",
				name: row.name ?? "Someone",
				image: row.image ?? null,
				value: decode(row.value),
				updatedAt: new Date(row.updated_at).toISOString(),
			}));
	}

	set(
		scope: PageStorageScope,
		key: string,
		userId: string,
		value: unknown,
		now: number,
	): PageStorageRefusal | null {
		const owner = ownerFor(scope, userId);
		const sizeBytes = pageStorageValueBytes(value ?? null);
		const [usage] = this.sql
			.exec<{
				total: number;
				mine: number;
				replacing: number;
				existing: number;
			}>(
				`SELECT
					coalesce(sum(size_bytes), 0) AS total,
					count(*) FILTER (WHERE (scope != 'shared' AND user_id = ?) OR (scope = 'shared' AND created_by = ?)) AS mine,
					coalesce(sum(size_bytes) FILTER (WHERE scope = ? AND key = ? AND user_id = ?), 0) AS replacing,
					count(*) FILTER (WHERE scope = ? AND key = ? AND user_id = ?) AS existing
				FROM entries`,
				userId,
				userId,
				scope,
				key,
				owner,
				scope,
				key,
				owner,
			)
			.toArray();
		const refusal = pageStorageRefusal(
			{
				totalBytes: usage?.total ?? 0,
				keysForUser: usage?.mine ?? 0,
				replacingBytes: usage?.replacing ?? 0,
				replacingExisting: (usage?.existing ?? 0) > 0,
			},
			sizeBytes,
		);
		if (refusal) return refusal;
		this.sql.exec(
			`INSERT INTO entries
				(scope, key, user_id, created_by, updated_by, value, size_bytes, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (scope, key, user_id) DO UPDATE SET
				updated_by = excluded.updated_by,
				value = excluded.value,
				size_bytes = excluded.size_bytes,
				updated_at = excluded.updated_at`,
			scope,
			key,
			owner,
			userId,
			userId,
			JSON.stringify(value ?? null),
			sizeBytes,
			now,
		);
		return null;
	}

	remove(scope: PageStorageScope, key: string, userId: string): void {
		this.sql.exec(
			"DELETE FROM entries WHERE scope = ? AND key = ? AND user_id = ?",
			scope,
			key,
			ownerFor(scope, userId),
		);
		if (scope === "slot") {
			this.clearLegacy(
				"DELETE FROM records WHERE key = ? AND user_id = ?",
				key,
				userId,
			);
		}
	}

	keys(viewerId: string): PageStorageKeySummary[] {
		return this.sql
			.exec<{
				scope: PageStorageScope;
				key: string;
				records: number;
				updated_at: number;
			}>(
				`SELECT scope, key, count(*) AS records, max(updated_at) AS updated_at
				 FROM entries
				 WHERE scope != 'private' OR user_id = ?
				 GROUP BY scope, key
				 ORDER BY key, scope`,
				viewerId,
			)
			.toArray()
			.map((row) => ({
				key: row.key,
				scope: row.scope,
				records: row.records,
				updatedAt: new Date(row.updated_at).toISOString(),
			}));
	}

	listKeys(
		scope: PageStorageScope,
		prefix: string,
		viewerId: string,
		limit: number,
	): PageStorageListEntry[] {
		return this.sql
			.exec<{ key: string; records: number; updated_at: number }>(
				`SELECT key, count(*) AS records, max(updated_at) AS updated_at
				 FROM entries
				 WHERE scope = ?
				   AND substr(key, 1, length(?)) = ?
				   AND (scope != 'private' OR user_id = ?)
				 GROUP BY key
				 ORDER BY key
				 LIMIT ?`,
				scope,
				prefix,
				prefix,
				viewerId,
				limit,
			)
			.toArray()
			.map((row) => ({
				key: row.key,
				records: row.records,
				updatedAt: new Date(row.updated_at).toISOString(),
			}));
	}

	scopedKeys(): {
		scope: PageStorageScope;
		key: string;
		owner: string | null;
	}[] {
		return this.sql
			.exec<{ scope: PageStorageScope; key: string; owner: string | null }>(
				`SELECT DISTINCT scope, key,
					CASE WHEN scope = 'private' THEN user_id ELSE NULL END AS owner
				 FROM entries
				 ORDER BY key, scope, owner`,
			)
			.toArray();
	}

	clear(key?: string): number {
		const before = this.count();
		if (key === undefined) {
			this.sql.exec("DELETE FROM entries");
			this.clearLegacy("DELETE FROM records");
		} else {
			this.sql.exec("DELETE FROM entries WHERE key = ?", key);
			this.clearLegacy("DELETE FROM records WHERE key = ?", key);
		}
		return before - this.count();
	}

	clearUser(userId: string): { cleared: number; anonymized: number } {
		const before = this.count();
		this.sql.exec("DELETE FROM entries WHERE user_id = ?", userId);
		this.clearLegacy("DELETE FROM records WHERE user_id = ?", userId);
		const cleared = before - this.count();
		const [written] = this.sql
			.exec<{ n: number }>(
				"SELECT count(*) AS n FROM entries WHERE updated_by = ? OR created_by = ?",
				userId,
				userId,
			)
			.toArray();
		this.sql.exec(
			`UPDATE entries SET
				updated_by = CASE WHEN updated_by = ? THEN NULL ELSE updated_by END,
				created_by = CASE WHEN created_by = ? THEN NULL ELSE created_by END
			 WHERE updated_by = ? OR created_by = ?`,
			userId,
			userId,
			userId,
			userId,
		);
		this.sql.exec("DELETE FROM visits WHERE user_id = ?", userId);
		return { cleared, anonymized: written?.n ?? 0 };
	}

	clearAll(): void {
		this.sql.exec("DELETE FROM entries");
		this.clearLegacy("DELETE FROM records");
		this.sql.exec("DELETE FROM visits");
	}

	private clearLegacy(query: string, ...bindings: unknown[]): void {
		if (this.hasLegacyRecords) this.sql.exec(query, ...bindings);
	}

	private count(): number {
		const [row] = this.sql
			.exec<{ n: number }>("SELECT count(*) AS n FROM entries")
			.toArray();
		return row?.n ?? 0;
	}
}
