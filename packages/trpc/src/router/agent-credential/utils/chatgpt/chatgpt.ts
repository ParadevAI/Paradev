/**
 * Codex's own ChatGPT sign-in, run by the API: the device-code flow `codex
 * login --device-auth` runs, and the refresh Codex does before its access
 * token expires. It is Codex's public client, so the session it makes is a
 * Codex login like any other, just one the person's laptop does not share —
 * a refresh token works once, and two holders of one would sign each other
 * out.
 */
import { z } from "zod";

const ISSUER = "https://auth.openai.com";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const TIMEOUT_MS = 10_000;

export const CHATGPT_DEVICE_URL = `${ISSUER}/codex/device`;

/** What a ChatGPT sign-in row stores, encrypted. */
export const chatgptTokensSchema = z.object({
	accessToken: z.string(),
	refreshToken: z.string(),
	idToken: z.string(),
	accountId: z.string(),
});
export type ChatgptTokens = z.infer<typeof chatgptTokensSchema>;

const deviceCodeSchema = z.object({
	device_auth_id: z.string(),
	user_code: z.string().optional(),
	usercode: z.string().optional(),
	interval: z.coerce.number().optional(),
});

const authorizationSchema = z.object({
	authorization_code: z.string(),
	code_verifier: z.string(),
});

const tokenSchema = z.object({
	access_token: z.string(),
	refresh_token: z.string(),
	id_token: z.string(),
});

const refreshSchema = z.object({
	access_token: z.string().optional(),
	refresh_token: z.string().optional(),
	id_token: z.string().optional(),
});

export class ChatgptSignInError extends Error {
	constructor(
		message: string,
		readonly reason:
			| "device-code-disabled"
			| "rejected"
			| "unreachable"
			| "no-account",
	) {
		super(message);
		this.name = "ChatgptSignInError";
	}
}

async function post(
	url: string,
	body: string,
	contentType: string,
): Promise<Response> {
	try {
		return await fetch(url, {
			method: "POST",
			headers: { "content-type": contentType },
			body,
			redirect: "error",
			signal: AbortSignal.timeout(TIMEOUT_MS),
		});
	} catch {
		throw new ChatgptSignInError("Could not reach OpenAI.", "unreachable");
	}
}

export function jwtClaims(jwt: string): Record<string, unknown> {
	const payload = jwt.split(".")[1];
	if (!payload) return {};
	try {
		return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
	} catch {
		return {};
	}
}

/** The claims Codex reads out of the id token, and nothing else of it. */
export function chatgptIdentity(idToken: string): {
	email: string | null;
	planType: string | null;
	userId: string | null;
	accountId: string | null;
} {
	const claims = jwtClaims(idToken);
	const auth = (claims["https://api.openai.com/auth"] ?? {}) as Record<
		string,
		unknown
	>;
	const text = (value: unknown) => (typeof value === "string" ? value : null);
	return {
		email: text(claims.email),
		planType: text(auth.chatgpt_plan_type),
		userId: text(auth.chatgpt_user_id) ?? text(auth.user_id),
		accountId: text(auth.chatgpt_account_id),
	};
}

export function accessTokenExpiresAt(accessToken: string): Date | null {
	const exp = jwtClaims(accessToken).exp;
	return typeof exp === "number" ? new Date(exp * 1000) : null;
}

export async function requestDeviceCode(): Promise<{
	deviceAuthId: string;
	userCode: string;
	intervalSeconds: number;
}> {
	const response = await post(
		`${ISSUER}/api/accounts/deviceauth/usercode`,
		JSON.stringify({ client_id: CLIENT_ID }),
		"application/json",
	);
	if (response.status === 404) {
		throw new ChatgptSignInError(
			"OpenAI did not offer a device code.",
			"device-code-disabled",
		);
	}
	if (!response.ok) {
		throw new ChatgptSignInError(
			`OpenAI answered ${response.status}.`,
			"unreachable",
		);
	}
	const body = deviceCodeSchema.parse(await response.json());
	const userCode = body.user_code ?? body.usercode;
	if (!userCode) {
		throw new ChatgptSignInError("OpenAI sent no code.", "unreachable");
	}
	return {
		deviceAuthId: body.device_auth_id,
		userCode,
		intervalSeconds: body.interval || 5,
	};
}

/**
 * One poll of a device code: null while the person has not approved it yet,
 * the tokens once they have.
 */
export async function pollDeviceCode(args: {
	deviceAuthId: string;
	userCode: string;
}): Promise<ChatgptTokens | null> {
	const response = await post(
		`${ISSUER}/api/accounts/deviceauth/token`,
		JSON.stringify({
			device_auth_id: args.deviceAuthId,
			user_code: args.userCode,
		}),
		"application/json",
	);
	if (response.status === 403 || response.status === 404) return null;
	if (!response.ok) {
		throw new ChatgptSignInError(
			`OpenAI answered ${response.status}.`,
			"rejected",
		);
	}
	const authorization = authorizationSchema.parse(await response.json());
	const exchanged = await post(
		`${ISSUER}/oauth/token`,
		new URLSearchParams({
			grant_type: "authorization_code",
			code: authorization.authorization_code,
			redirect_uri: `${ISSUER}/deviceauth/callback`,
			client_id: CLIENT_ID,
			code_verifier: authorization.code_verifier,
		}).toString(),
		"application/x-www-form-urlencoded",
	);
	if (!exchanged.ok) {
		throw new ChatgptSignInError(
			`OpenAI answered ${exchanged.status}.`,
			"rejected",
		);
	}
	const tokens = tokenSchema.parse(await exchanged.json());
	const accountId = chatgptIdentity(tokens.id_token).accountId;
	if (!accountId) {
		throw new ChatgptSignInError(
			"This ChatGPT login has no account.",
			"no-account",
		);
	}
	return {
		accessToken: tokens.access_token,
		refreshToken: tokens.refresh_token,
		idToken: tokens.id_token,
		accountId,
	};
}

/**
 * Trades the refresh token for new tokens. The old refresh token is spent
 * the moment OpenAI answers, so the caller must store what comes back.
 */
export async function refreshChatgptTokens(
	tokens: ChatgptTokens,
): Promise<ChatgptTokens> {
	const response = await post(
		`${ISSUER}/oauth/token`,
		JSON.stringify({
			grant_type: "refresh_token",
			client_id: CLIENT_ID,
			refresh_token: tokens.refreshToken,
		}),
		"application/json",
	);
	if (response.status === 400 || response.status === 401) {
		throw new ChatgptSignInError(
			"OpenAI refused to refresh this sign-in.",
			"rejected",
		);
	}
	if (!response.ok) {
		throw new ChatgptSignInError(
			`OpenAI answered ${response.status}.`,
			"unreachable",
		);
	}
	const next = refreshSchema.parse(await response.json());
	return {
		...tokens,
		accessToken: next.access_token ?? tokens.accessToken,
		refreshToken: next.refresh_token ?? tokens.refreshToken,
		idToken: next.id_token ?? tokens.idToken,
	};
}
