import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	accessTokenExpiresAt,
	ChatgptSignInError,
	pollDeviceCode,
	refreshChatgptTokens,
} from "./chatgpt";

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function jwt(claims: Record<string, unknown>): string {
	const part = (value: unknown) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "none" })}.${part(claims)}.sig`;
}

function answer(responses: Array<[number, unknown]>) {
	const calls: Array<{ url: string; body: string }> = [];
	globalThis.fetch = mock(async (url: string | URL, init?: RequestInit) => {
		calls.push({ url: String(url), body: String(init?.body) });
		const [status, body] = responses.shift() ?? [500, {}];
		return new Response(JSON.stringify(body), { status });
	}) as unknown as typeof fetch;
	return calls;
}

const idToken = jwt({
	email: "ada@example.com",
	"https://api.openai.com/auth": { chatgpt_account_id: "acct-1" },
});

describe("pollDeviceCode", () => {
	test("is pending while OpenAI has not seen an approval", async () => {
		answer([[403, {}]]);
		expect(
			await pollDeviceCode({ deviceAuthId: "d", userCode: "U" }),
		).toBeNull();
	});

	test("trades an approval for tokens with the verifier OpenAI returned", async () => {
		const calls = answer([
			[200, { authorization_code: "code-1", code_verifier: "verifier-1" }],
			[200, { access_token: "a1", refresh_token: "r1", id_token: idToken }],
		]);
		expect(await pollDeviceCode({ deviceAuthId: "d", userCode: "U" })).toEqual({
			accessToken: "a1",
			refreshToken: "r1",
			idToken,
			accountId: "acct-1",
		});
		const exchange = new URLSearchParams(calls[1]?.body);
		expect(exchange.get("code")).toBe("code-1");
		expect(exchange.get("code_verifier")).toBe("verifier-1");
		expect(exchange.get("redirect_uri")).toBe(
			"https://auth.openai.com/deviceauth/callback",
		);
	});
});

describe("refreshChatgptTokens", () => {
	const tokens = {
		accessToken: "a1",
		refreshToken: "r1",
		idToken,
		accountId: "acct-1",
	};

	test("keeps the new refresh token, since the old one is spent", async () => {
		answer([[200, { access_token: "a2", refresh_token: "r2" }]]);
		expect(await refreshChatgptTokens(tokens)).toEqual({
			...tokens,
			accessToken: "a2",
			refreshToken: "r2",
		});
	});

	test("a refused refresh is an error, not a silent keep", async () => {
		answer([[401, { error: "refresh_token_reused" }]]);
		await expect(refreshChatgptTokens(tokens)).rejects.toBeInstanceOf(
			ChatgptSignInError,
		);
	});
});

test("an access token's expiry comes from its exp claim", () => {
	expect(accessTokenExpiresAt(jwt({ exp: 1_000 }))?.getTime()).toBe(1_000_000);
	expect(accessTokenExpiresAt("not-a-jwt")).toBeNull();
});
