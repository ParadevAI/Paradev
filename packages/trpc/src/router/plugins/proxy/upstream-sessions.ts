import type { Redis } from "@upstash/redis";

const UPSTREAM_SESSION_IDLE_SECONDS = 60 * 60;

export interface ResumableSession {
	sessionId: string;
	protocolVersion: string;
}

/**
 * The vendor sessions behind one caller's MCP session, one per connection. A
 * store that cannot be reached holds nothing, so calls fall back to one vendor
 * session each.
 */
export interface UpstreamSessions {
	get(connectionId: string): Promise<ResumableSession | null>;
	/** False when another call stored a session first, or the store is down. */
	claim(connectionId: string, session: ResumableSession): Promise<boolean>;
	touch(): Promise<void>;
	drop(connectionId: string): Promise<void>;
	takeAll(): Promise<Record<string, ResumableSession>>;
}

export type SessionRedis = Pick<
	Redis,
	"hget" | "hsetnx" | "hdel" | "hgetall" | "expire" | "del"
>;

export function upstreamSessions(
	redis: SessionRedis,
	userId: string,
	callerSessionId: string,
): UpstreamSessions {
	const key = `plugin-mcp-session:${userId}:${callerSessionId}`;
	let warned = false;
	const unavailable =
		<T>(fallback: T) =>
		(error: unknown): T => {
			if (!warned) {
				console.warn("[plugins/proxy] session store unavailable", { error });
				warned = true;
			}
			return fallback;
		};
	return {
		get: (connectionId) =>
			redis.hget<ResumableSession>(key, connectionId).catch(unavailable(null)),
		async claim(connectionId, session) {
			try {
				const claimed = (await redis.hsetnx(key, connectionId, session)) === 1;
				if (claimed) await redis.expire(key, UPSTREAM_SESSION_IDLE_SECONDS);
				return claimed;
			} catch (error) {
				return unavailable(false)(error);
			}
		},
		touch: () =>
			redis
				.expire(key, UPSTREAM_SESSION_IDLE_SECONDS)
				.then(() => {}, unavailable(undefined)),
		drop: (connectionId) =>
			redis.hdel(key, connectionId).then(() => {}, unavailable(undefined)),
		async takeAll() {
			try {
				const sessions =
					await redis.hgetall<Record<string, ResumableSession>>(key);
				await redis.del(key);
				return sessions ?? {};
			} catch (error) {
				return unavailable({})(error);
			}
		},
	};
}
