import { signClaims, verifyClaims } from "@superset/shared/usercontent";

const TURN_TOKEN_KIND = "agent-turn";
export const TURN_TOKEN_TTL_SECONDS = 15 * 60;
export const TURN_TOKEN_HEADER = "x-agent-turn-token";

export interface TurnTokenClaims {
	turnId: string;
	sessionId: string;
	agentId: string;
	organizationId: string;
	/** The person whose message started the turn, recorded by the API. */
	actingUserId: string | null;
	exp: number;
}

export function signTurnToken(
	secret: string,
	claims: Omit<TurnTokenClaims, "exp">,
	now: number = Date.now(),
): Promise<string> {
	return signClaims(secret, {
		kind: TURN_TOKEN_KIND,
		...claims,
		exp: Math.floor(now / 1000) + TURN_TOKEN_TTL_SECONDS,
	});
}

export async function verifyTurnToken(
	secret: string,
	token: string,
	now: number = Date.now(),
): Promise<TurnTokenClaims | null> {
	const wire = await verifyClaims(secret, token, now);
	if (!wire || wire.kind !== TURN_TOKEN_KIND) return null;
	const { turnId, sessionId, agentId, organizationId, actingUserId, exp } =
		wire;
	if (
		typeof turnId !== "string" ||
		typeof sessionId !== "string" ||
		typeof agentId !== "string" ||
		typeof organizationId !== "string" ||
		(actingUserId !== null && typeof actingUserId !== "string") ||
		typeof exp !== "number"
	) {
		return null;
	}
	return { turnId, sessionId, agentId, organizationId, actingUserId, exp };
}
