import type { DBAdapter } from "better-auth/types";

type GrantAdapter = Pick<DBAdapter, "findOne" | "findMany" | "updateMany">;

type RefreshTokenRow = {
	id: string;
	userId: string;
	clientId: string;
	sessionId?: string | null;
	revoked?: Date | string | null;
	expiresAt?: Date | string | null;
};

type AccessTokenClaims = {
	sub?: unknown;
	azp?: unknown;
	sid?: unknown;
	scope?: unknown;
};

type Grant = { userId: string; clientId: string; sessionId: string | null };

const LIVE_CACHE_TTL_MS = 30_000;
const LIVE_CACHE_MAX_ENTRIES = 10_000;
const liveCache = new Map<string, number>();

function isLiveRow(row: RefreshTokenRow, now: Date): boolean {
	return !row.revoked && !!row.expiresAt && new Date(row.expiresAt) > now;
}

async function grantRows(
	adapter: GrantAdapter,
	grant: Grant,
): Promise<RefreshTokenRow[]> {
	const rows = await adapter.findMany<RefreshTokenRow>({
		model: "oauthRefreshToken",
		where: [
			{ field: "userId", value: grant.userId },
			{ field: "clientId", value: grant.clientId },
		],
	});
	return rows.filter((row) => (row.sessionId ?? null) === grant.sessionId);
}

/**
 * The grant an access token belongs to. The refresh rows carry the consenting
 * session's id, which is set to null when that session is deleted, so a token
 * whose session is gone belongs to the rows that lost theirs.
 */
async function resolveGrant(
	adapter: GrantAdapter,
	claims: AccessTokenClaims,
): Promise<Grant | null> {
	if (typeof claims.sub !== "string" || typeof claims.azp !== "string") {
		return null;
	}
	const grant = { userId: claims.sub, clientId: claims.azp, sessionId: null };
	if (typeof claims.sid !== "string") return grant;
	const session = await adapter.findOne<{ id: string }>({
		model: "session",
		where: [{ field: "id", value: claims.sid }],
	});
	return session ? { ...grant, sessionId: claims.sid } : grant;
}

function hasRefreshGrant(claims: AccessTokenClaims): boolean {
	return (
		typeof claims.scope === "string" &&
		claims.scope.split(" ").includes("offline_access")
	);
}

function cacheKey(claims: AccessTokenClaims): string {
	return `${claims.sub}:${claims.azp}:${claims.sid ?? ""}`;
}

function forgetUser(userId: string) {
	for (const key of liveCache.keys()) {
		if (key.startsWith(`${userId}:`)) liveCache.delete(key);
	}
}

/**
 * JWT access tokens are not stored, so revocation reaches them through their
 * refresh grant: a token is live while one refresh token of its grant is.
 * Tokens without `azp` (jwt plugin) or without `offline_access` have no grant
 * and keep their signature-only lifetime.
 */
export async function isOAuthAccessTokenLive(
	adapter: GrantAdapter,
	claims: AccessTokenClaims,
	now = new Date(),
): Promise<boolean> {
	if (typeof claims.azp !== "string" || !hasRefreshGrant(claims)) return true;
	const key = cacheKey(claims);
	const cachedAt = liveCache.get(key);
	if (cachedAt !== undefined && now.getTime() - cachedAt < LIVE_CACHE_TTL_MS) {
		return true;
	}
	const grant = await resolveGrant(adapter, claims);
	if (!grant) return false;
	const live = (await grantRows(adapter, grant)).some((row) =>
		isLiveRow(row, now),
	);
	if (live) {
		if (liveCache.size >= LIVE_CACHE_MAX_ENTRIES) liveCache.clear();
		liveCache.set(key, now.getTime());
	} else {
		liveCache.delete(key);
	}
	return live;
}

async function revokeGrant(adapter: GrantAdapter, grant: Grant) {
	forgetUser(grant.userId);
	const now = new Date();
	const live = (await grantRows(adapter, grant)).filter((row) =>
		isLiveRow(row, now),
	);
	if (!live.length) return;
	await adapter.updateMany({
		model: "oauthRefreshToken",
		where: [{ field: "id", operator: "in", value: live.map((row) => row.id) }],
		update: { revoked: now },
	});
}

export async function revokeOAuthAccessTokenGrant(
	adapter: GrantAdapter,
	claims: AccessTokenClaims,
) {
	const grant = await resolveGrant(adapter, claims);
	if (grant) await revokeGrant(adapter, grant);
}

/** A rotation race can leave two live children of one parent; revoking one must revoke both. */
export async function revokeOAuthRefreshTokenGrant(
	adapter: GrantAdapter,
	refreshToken: {
		userId: string;
		clientId?: string;
		sessionId?: string | null;
	},
) {
	forgetUser(refreshToken.userId);
	if (!refreshToken.clientId || !refreshToken.sessionId) return;
	await revokeGrant(adapter, {
		userId: refreshToken.userId,
		clientId: refreshToken.clientId,
		sessionId: refreshToken.sessionId,
	});
}
