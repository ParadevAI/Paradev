import {
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getApiUrl, getSupersetConfigPath } from "./config";

const RENEW_BEFORE_MS = 5 * 60 * 1000;
const EXCHANGE_TIMEOUT_MS = 10_000;

function cacheDir(): string {
	return join(dirname(getSupersetConfigPath()), "organization-tokens");
}

function claims(token: string): { sub?: unknown; exp?: unknown } | null {
	const payload = token.split(".")[1];
	if (!payload) return null;
	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return null;
	}
}

function cached(login: string, organizationId: string): string | null {
	try {
		const token = readFileSync(
			join(cacheDir(), `${organizationId}.jwt`),
			"utf8",
		).trim();
		const tokenClaims = claims(token);
		const fresh =
			typeof tokenClaims?.exp === "number" &&
			tokenClaims.exp * 1000 - RENEW_BEFORE_MS > Date.now();
		return fresh && tokenClaims?.sub === claims(login)?.sub ? token : null;
	} catch {
		return null;
	}
}

function keep(organizationId: string, token: string) {
	try {
		const dir = cacheDir();
		mkdirSync(dir, { recursive: true, mode: 0o700 });
		const path = join(dir, `${organizationId}.jwt`);
		const temporary = `${path}.${process.pid}.tmp`;
		writeFileSync(temporary, token, { mode: 0o600 });
		renameSync(temporary, path);
	} catch {}
}

/**
 * A token for one organization, exchanged from an OAuth login and kept on
 * disk until it nears expiry, so the API confines this CLI to that
 * organization.
 */
export async function organizationBearer(
	login: string,
	organizationId: string,
	fetchImpl: (url: string, init: RequestInit) => Promise<Response> = fetch,
): Promise<string> {
	const reused = cached(login, organizationId);
	if (reused) return reused;
	try {
		const response = await fetchImpl(
			`${getApiUrl()}/api/auth/token?organizationId=${encodeURIComponent(organizationId)}`,
			{
				headers: { Authorization: `Bearer ${login}` },
				signal: AbortSignal.timeout(EXCHANGE_TIMEOUT_MS),
			},
		);
		// LEGACY(remove when list-only tokens are refused): an API older than
		// organization tokens can't exchange a login, so the login goes as is.
		if (!response.ok) return login;
		const { token } = (await response.json()) as { token?: unknown };
		if (typeof token !== "string") return login;
		keep(organizationId, token);
		return token;
	} catch {
		return login;
	}
}

export function forgetOrganizationTokens() {
	rmSync(cacheDir(), { recursive: true, force: true });
}
