import { type CryptoKey, importJWK, importSPKI, jwtVerify } from "jose";

/**
 * What a connection may do. `control` is the Dev server running a turn; `watch` is a group member's app streaming
 * one session live, read-only.
 */
type Scope = "control" | "watch";

export interface Grant {
	scope: Scope;
	/** The one ACP session this connection may load: a group id, or `<groupId>.trigger-<id>` for a trigger's. */
	sessionId: string;
}

/** The websocket subprotocol a client offers next to the token; the server answers with it. */
export const ACP_PROTOCOL = "acp";

export class TokenError extends Error {}

/** Accepts the server's public key as SPKI PEM or as a JWK (JSON), whichever the deployment stores. */
export async function importPublicKey(text: string): Promise<CryptoKey> {
	const trimmed = text.trim().replace(/\\n/g, "\n");
	if (trimmed.startsWith("{"))
		return (await importJWK(JSON.parse(trimmed), "ES256")) as CryptoKey;
	return importSPKI(trimmed, "ES256");
}

/**
 * Verifies box tokens: ES256 signed by the Dev server, `aud` = this box (so a token for one box is useless on
 * another), a known scope, a session, and an expiry (jose rejects expired tokens; we also require `exp` to exist).
 */
export function createTokenVerifier(opts: {
	publicKey: CryptoKey;
	boxId: string;
}) {
	return async function verify(token: string): Promise<Grant> {
		try {
			const { payload } = await jwtVerify(token, opts.publicKey, {
				algorithms: ["ES256"],
				audience: opts.boxId,
				requiredClaims: ["exp", "sid"],
			});
			if (payload.scope !== "control" && payload.scope !== "watch")
				throw new TokenError("unknown scope");
			if (typeof payload.sid !== "string") throw new TokenError("bad session");
			return { scope: payload.scope, sessionId: payload.sid };
		} catch (err) {
			throw err instanceof TokenError
				? err
				: new TokenError(err instanceof Error ? err.message : "invalid token");
		}
	};
}

/**
 * Browsers can't set headers on a websocket and URLs end up in logs, so the token travels as a subprotocol:
 * `Sec-WebSocket-Protocol: acp, <jwt>`.
 */
export function tokenFromProtocols(header: string | undefined): string | null {
	const offered = (header ?? "")
		.split(",")
		.map((p) => p.trim())
		.filter(Boolean);
	if (!offered.includes(ACP_PROTOCOL)) return null;
	return offered.find((p) => p !== ACP_PROTOCOL) ?? null;
}
