import type { SqlLike } from "@superset/shared/page-storage-records";

export const ACCESS_TTL_MS = 5 * 60_000;
/** The most people /api/pages/access takes in one request. */
export const MAX_ACCESS_ASK = 1000;

export interface UserAccess {
	read: boolean;
	write: boolean;
	author: boolean;
}

export interface AccessAnswer {
	guests: boolean;
	users: Record<string, UserAccess>;
}

export interface CheckedAccess {
	guests: boolean;
	users: Map<string, UserAccess>;
	/** Stale once `clear` has run since the check began. */
	generation: number;
}

/** Resolves null when the page is missing or taken down; rejects when the API cannot answer. */
export type AskAccess = (userIds: string[]) => Promise<AccessAnswer | null>;

interface Asked {
	guests: boolean;
	users: Map<string, UserAccess>;
}

const REFUSED: UserAccess = { read: false, write: false, author: false };

function isUserAccess(value: unknown): value is UserAccess {
	if (!value || typeof value !== "object") return false;
	const { read, write, author } = value as Record<string, unknown>;
	return (
		typeof read === "boolean" &&
		typeof write === "boolean" &&
		typeof author === "boolean"
	);
}

export function parseAccessAnswer(value: unknown): AccessAnswer | null {
	if (!value || typeof value !== "object") return null;
	const { guests, users } = value as Record<string, unknown>;
	if (typeof guests !== "boolean" || !users || typeof users !== "object") {
		return null;
	}
	const parsed: Record<string, UserAccess> = {};
	for (const [userId, access] of Object.entries(users)) {
		if (!isUserAccess(access)) return null;
		parsed[userId] = {
			read: access.read,
			write: access.write,
			author: access.author,
		};
	}
	return { guests, users: parsed };
}

type CachedUser = {
	user_id: string;
	read: number;
	write: number;
	author: number;
};

export class PageAccessCache {
	#generation = 0;
	private inFlight = new Map<string, Promise<Asked>>();

	constructor(
		private readonly sql: SqlLike,
		private readonly ask: AskAccess,
		private readonly now: () => number = Date.now,
	) {}

	ensureSchema(): void {
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS access_cache (
				user_id TEXT PRIMARY KEY,
				read INTEGER NOT NULL,
				write INTEGER NOT NULL,
				author INTEGER NOT NULL,
				at INTEGER NOT NULL
			)`,
		);
		this.sql.exec(
			`CREATE TABLE IF NOT EXISTS page_flags (
				id INTEGER PRIMARY KEY CHECK (id = 1),
				guests INTEGER NOT NULL,
				at INTEGER NOT NULL
			)`,
		);
	}

	clear(): void {
		this.#generation += 1;
		this.inFlight.clear();
		this.sql.exec("DELETE FROM access_cache");
		this.sql.exec("DELETE FROM page_flags");
	}

	get generation(): number {
		return this.#generation;
	}

	isCurrent(generation: number): boolean {
		return generation === this.#generation;
	}

	async check(userIds: readonly string[]): Promise<CheckedAccess> {
		const generation = this.#generation;
		const fresh = this.now() - ACCESS_TTL_MS;
		this.sql.exec("DELETE FROM access_cache WHERE at <= ?", fresh);
		const wanted = new Set(userIds);
		const users = new Map<string, UserAccess>();
		for (const row of this.sql
			.exec<CachedUser>("SELECT user_id, read, write, author FROM access_cache")
			.toArray()) {
			if (!wanted.has(row.user_id)) continue;
			users.set(row.user_id, {
				read: row.read === 1,
				write: row.write === 1,
				author: row.author === 1,
			});
		}
		const [flags] = this.sql
			.exec<{ guests: number }>(
				"SELECT guests FROM page_flags WHERE at > ?",
				fresh,
			)
			.toArray();
		const missing = [...wanted].filter((userId) => !users.has(userId)).sort();
		if (flags && missing.length === 0) {
			return { guests: flags.guests === 1, users, generation };
		}

		const key = `${generation}:${missing.join(",")}`;
		let asking = this.inFlight.get(key);
		if (!asking) {
			asking = this.askAll(missing, generation).finally(() => {
				if (this.inFlight.get(key) === asking) this.inFlight.delete(key);
			});
			this.inFlight.set(key, asking);
		}
		const asked = await asking;
		for (const [userId, access] of asked.users) users.set(userId, access);
		return { guests: asked.guests, users, generation };
	}

	private async askAll(missing: string[], generation: number): Promise<Asked> {
		const answers: (AccessAnswer | null)[] = [];
		for (
			let start = 0;
			start === 0 || start < missing.length;
			start += MAX_ACCESS_ASK
		) {
			answers.push(
				await this.ask(missing.slice(start, start + MAX_ACCESS_ASK)),
			);
		}
		const guests = answers.every((answer) => answer?.guests === true);
		const answered = new Map<string, UserAccess>();
		for (const userId of missing) {
			answered.set(
				userId,
				answers.find((answer) => answer?.users[userId])?.users[userId] ??
					REFUSED,
			);
		}
		if (!this.isCurrent(generation)) return { guests, users: answered };
		const at = this.now();
		this.sql.exec(
			"INSERT OR REPLACE INTO page_flags (id, guests, at) VALUES (1, ?, ?)",
			guests ? 1 : 0,
			at,
		);
		for (const [userId, access] of answered) {
			this.sql.exec(
				"INSERT OR REPLACE INTO access_cache (user_id, read, write, author, at) VALUES (?, ?, ?, ?, ?)",
				userId,
				access.read ? 1 : 0,
				access.write ? 1 : 0,
				access.author ? 1 : 0,
				at,
			);
		}
		return { guests, users: answered };
	}
}
