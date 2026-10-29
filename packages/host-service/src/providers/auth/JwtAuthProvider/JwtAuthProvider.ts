import type { ApiAuthProvider } from "../types";

const JWT_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const JWT_CACHE_DURATION_MS = 55 * 60 * 1000;
// Every API call and every relay reconnect asks for a JWT, so a rejected
// session would otherwise hit /api/auth/token every few seconds per host.
// A synchronized fleet doing that trips Vercel's per-IP mitigation (2026-07-08).
const MINT_RETRY_BASE_MS = 5_000;
const MINT_RETRY_MAX_MS = 2 * 60 * 1000;
// Callers share one in-flight mint, so a stalled request must not hold them all.
const MINT_TIMEOUT_MS = 15_000;
export const SESSION_REJECTED_ERROR_NAME = "SessionRejectedError";

function looksLikeJwt(token: string): boolean {
	const parts = token.split(".");
	return parts.length === 3 && parts.every(Boolean);
}

export interface JwtApiAuthProviderOptions {
	/**
	 * Returns the current session/api-key/JWT token to authenticate with.
	 * Called whenever a fresh JWT needs to be minted, so token rotations
	 * (re-login, refresh) are picked up without restarting the host-service.
	 */
	getSessionToken: () => Promise<string>;
	onInvalidateCache?: () => void;
	apiUrl: string;
	mintTimeoutMs?: number;
}

export class JwtApiAuthProvider implements ApiAuthProvider {
	private readonly getSessionToken: () => Promise<string>;
	private readonly onInvalidateCache?: () => void;
	private readonly apiUrl: string;
	private readonly mintTimeoutMs: number;
	private cachedJwt: string | null = null;
	private cachedJwtExpiresAt = 0;
	private inFlightMint: {
		sessionToken: string;
		promise: Promise<string>;
	} | null = null;
	private mintFailure: {
		sessionToken: string;
		error: Error;
		count: number;
		retryAt: number;
	} | null = null;

	constructor(options: JwtApiAuthProviderOptions) {
		this.getSessionToken = options.getSessionToken;
		this.onInvalidateCache = options.onInvalidateCache;
		this.apiUrl = options.apiUrl;
		this.mintTimeoutMs = options.mintTimeoutMs ?? MINT_TIMEOUT_MS;
	}

	async getHeaders(): Promise<Record<string, string>> {
		const jwt = await this.getJwt();
		return { Authorization: `Bearer ${jwt}` };
	}

	invalidateCache(): void {
		this.cachedJwt = null;
		this.cachedJwtExpiresAt = 0;
		this.onInvalidateCache?.();
	}

	async getJwt(): Promise<string> {
		if (
			this.cachedJwt &&
			Date.now() < this.cachedJwtExpiresAt - JWT_REFRESH_BUFFER_MS
		) {
			return this.cachedJwt;
		}

		const sessionToken = await this.getSessionToken();

		// CLI OAuth code+PKCE login stores the OAuth access token directly,
		// which is already a JWT signed by the same JWKS the relay verifies
		// against and carries `organizationIds` via customAccessTokenClaims.
		// Pass it through — no /api/auth/token exchange needed (and the
		// better-auth jwt plugin endpoint doesn't accept OAuth tokens
		// anyway, only sessions and api keys).
		if (looksLikeJwt(sessionToken)) {
			return sessionToken;
		}

		const failure = this.mintFailure;
		if (
			failure?.sessionToken === sessionToken &&
			Date.now() < failure.retryAt
		) {
			throw failure.error;
		}
		if (this.inFlightMint?.sessionToken === sessionToken) {
			return this.inFlightMint.promise;
		}
		const promise = this.mint(sessionToken).finally(() => {
			if (this.inFlightMint?.promise === promise) this.inFlightMint = null;
		});
		this.inFlightMint = { sessionToken, promise };
		return promise;
	}

	private async mint(sessionToken: string): Promise<string> {
		try {
			// better-auth's apiKey plugin reads `sk_live_…` from x-api-key, not
			// Authorization: Bearer; mirror what the CLI's tRPC client does in
			// packages/cli/src/lib/api-client.ts.
			const response = await fetch(`${this.apiUrl}/api/auth/token`, {
				headers: sessionToken.startsWith("sk_live_")
					? { "x-api-key": sessionToken }
					: { Authorization: `Bearer ${sessionToken}` },
				signal: AbortSignal.timeout(this.mintTimeoutMs),
			});
			if (!response.ok) {
				const error = new Error(`Failed to mint JWT: ${response.status}`);
				if (response.status === 401) error.name = SESSION_REJECTED_ERROR_NAME;
				throw error;
			}
			const data = (await response.json()) as { token: string };
			this.mintFailure = null;
			this.cachedJwt = data.token;
			this.cachedJwtExpiresAt = Date.now() + JWT_CACHE_DURATION_MS;
			return data.token;
		} catch (error) {
			const previous =
				this.mintFailure?.sessionToken === sessionToken
					? this.mintFailure.count
					: 0;
			const count = previous + 1;
			this.mintFailure = {
				sessionToken,
				error: error instanceof Error ? error : new Error(String(error)),
				count,
				retryAt:
					Date.now() +
					Math.min(MINT_RETRY_BASE_MS * 2 ** (count - 1), MINT_RETRY_MAX_MS),
			};
			throw error;
		}
	}
}
