import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";

/** The claims the Workers act on. `scope` is set only on tokens the API mints for itself. */
export interface AuthContext {
	sub: string;
	organizationIds: string[];
	/** Absent on tokens minted before the claim existed, and on OAuth and service tokens. */
	teamIds: string[];
	scope?: string;
	name?: string | null;
	image?: string | null;
}

const jwksByUrl = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJWKS(authUrl: string): ReturnType<typeof createRemoteJWKSet> {
	let jwks = jwksByUrl.get(authUrl);
	if (!jwks) {
		jwks = createRemoteJWKSet(new URL("/api/auth/jwks", authUrl));
		jwksByUrl.set(authUrl, jwks);
	}
	return jwks;
}

/** The addresses the product API accepts as a token's audience. */
export const productAudiences = (apiUrl: string): string[] => [
	apiUrl,
	`${apiUrl}/`,
	`${apiUrl}/api/v2/agent/mcp`,
	`${apiUrl}/mcp`,
];

/**
 * Verify a user JWT the API issued, addressed to one of `audience`. An
 * expired token is silent; any other failure is logged without the decoded
 * payload (it carries plaintext emails).
 */
export async function verifyUserBearer(
	token: string,
	authUrl: string,
	audience: string[],
): Promise<(JWTPayload & { sub: string }) | null> {
	try {
		const { payload } = await jwtVerify(token, getJWKS(authUrl), {
			issuer: authUrl,
			audience,
		});
		return payload.sub ? { ...payload, sub: payload.sub } : null;
	} catch (error) {
		const code =
			error instanceof Error && "code" in error
				? (error as { code?: string }).code
				: undefined;
		if (code !== "ERR_JWT_EXPIRED") {
			const message = error instanceof Error ? error.message : String(error);
			console.warn(`[jwt] verification failed: ${message}`);
		}
		return null;
	}
}

/** The claims a Worker acts on, from a user JWT addressed to the API itself. */
export async function verifyJWT(
	token: string,
	authUrl: string,
): Promise<AuthContext | null> {
	const payload = await verifyUserBearer(token, authUrl, [authUrl]);
	const organizationIds = payload?.organizationIds as string[] | undefined;
	if (!payload || !organizationIds) return null;
	const teamIds = Array.isArray(payload.teamIds)
		? payload.teamIds.filter((id): id is string => typeof id === "string")
		: [];
	const scope = typeof payload.scope === "string" ? payload.scope : undefined;
	const name = typeof payload.name === "string" ? payload.name : null;
	const image = typeof payload.image === "string" ? payload.image : null;
	return { sub: payload.sub, organizationIds, teamIds, scope, name, image };
}
