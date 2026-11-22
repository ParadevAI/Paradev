import type { Redis } from "@upstash/redis";

export const UPSTREAM_SESSION_IDLE_SECONDS = 60 * 60;

export interface ResumableSession {
	sessionId: string;
	protocolVersion: string;
}

/** The vendor sessions behind one caller's MCP session, one per connection. */
export interface UpstreamSessions {
	get(connectionId: string): Promise<ResumableSession | null>;
	set(connectionId: string, session: ResumableSession): Promise<void>;
	takeAll(): Promise<Record<string, ResumableSession>>;
}

export function upstreamSessions(
	redis: Redis,
	userId: string,
	callerSessionId: string,
): UpstreamSessions {
	const key = `plugin-mcp-session:${userId}:${callerSessionId}`;
	return {
		async get(connectionId) {
			const session = await redis.hget<ResumableSession>(key, connectionId);
			if (session) await redis.expire(key, UPSTREAM_SESSION_IDLE_SECONDS);
			return session;
		},
		async set(connectionId, session) {
			await redis.hset(key, { [connectionId]: session });
			await redis.expire(key, UPSTREAM_SESSION_IDLE_SECONDS);
		},
		async takeAll() {
			const sessions =
				await redis.hgetall<Record<string, ResumableSession>>(key);
			await redis.del(key);
			return sessions ?? {};
		},
	};
}
