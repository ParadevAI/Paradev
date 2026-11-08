import { mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

/** Scan state for one source (a log file or an agent database), as plain
 * JSON data. */
export interface UsageStateStore {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
	delete(key: string): void;
	beginScan(): void;
	/** Drops the keys this scan did not use. */
	endScan(): void;
}

export class MemoryStateStore implements UsageStateStore {
	protected readonly values = new Map<string, unknown>();
	protected readonly dirty = new Set<string>();
	protected used = new Set<string>();

	get(key: string): unknown {
		this.used.add(key);
		return this.values.get(key);
	}

	set(key: string, value: unknown): void {
		this.used.add(key);
		this.values.set(key, value);
		this.dirty.add(key);
	}

	delete(key: string): void {
		this.used.delete(key);
		this.values.delete(key);
		this.dirty.delete(key);
	}

	beginScan(): void {
		this.used = new Set();
	}

	endScan(): void {
		for (const key of this.values.keys()) {
			if (!this.used.has(key)) this.values.delete(key);
		}
		this.dirty.clear();
	}
}

/** Saved only at the end of a scan, so any saved row is a consistent state
 * to resume from. A new `version` or an unreadable file starts it empty. */
export class SqliteStateStore extends MemoryStateStore {
	private readonly unsaved = new Set<string>();
	private savedAt = 0;
	private readonly selectValue;

	private constructor(
		private readonly db: InstanceType<typeof Database>,
		private readonly saveEveryMs: number,
	) {
		super();
		this.selectValue = db.prepare("SELECT value FROM state WHERE key = ?");
	}

	static open(
		path: string,
		version: string,
		saveEveryMs = 5 * 60 * 1000,
	): SqliteStateStore {
		mkdirSync(dirname(path), { recursive: true });
		try {
			return new SqliteStateStore(openStateDb(path, version), saveEveryMs);
		} catch {
			for (const suffix of ["", "-wal", "-shm"]) {
				rmSync(`${path}${suffix}`, { force: true });
			}
			return new SqliteStateStore(openStateDb(path, version), saveEveryMs);
		}
	}

	override get(key: string): unknown {
		const value = super.get(key);
		if (value !== undefined) return value;
		const row = this.selectValue.get(key) as { value: string } | undefined;
		if (!row) return undefined;
		try {
			const parsed: unknown = JSON.parse(row.value);
			this.values.set(key, parsed);
			return parsed;
		} catch {
			return undefined;
		}
	}

	close(): void {
		this.db.close();
	}

	override endScan(): void {
		for (const key of this.dirty) {
			if (this.used.has(key)) this.unsaved.add(key);
		}
		const now = Date.now();
		if (now - this.savedAt >= this.saveEveryMs) {
			this.save();
			this.savedAt = now;
		}
		super.endScan();
	}

	private save(): void {
		const upsert = this.db.prepare(
			"INSERT INTO state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
		);
		const remove = this.db.prepare("DELETE FROM state WHERE key = ?");
		const saved = this.db.prepare("SELECT key FROM state").pluck().all();
		try {
			this.db.transaction(() => {
				for (const key of this.unsaved) {
					const value = this.values.get(key);
					if (this.used.has(key) && value !== undefined) {
						upsert.run(key, JSON.stringify(value));
					}
				}
				for (const key of saved as string[]) {
					if (!this.used.has(key)) remove.run(key);
				}
			})();
			this.unsaved.clear();
		} catch (error) {
			// The in-memory state stays valid; the next save writes it again.
			console.warn("[usage-store] write failed", error);
		}
	}
}

function openStateDb(
	path: string,
	version: string,
): InstanceType<typeof Database> {
	const db = new Database(path);
	try {
		db.pragma("journal_mode = WAL");
		db.pragma("busy_timeout = 2000");
		db.exec(`CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
		const stored = db
			.prepare("SELECT value FROM meta WHERE key = 'version'")
			.pluck()
			.get();
		if (stored !== version) {
			db.transaction(() => {
				db.exec("DELETE FROM state");
				db.prepare(
					"INSERT INTO meta (key, value) VALUES ('version', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
				).run(version);
			})();
		}
		return db;
	} catch (error) {
		db.close();
		throw error;
	}
}
