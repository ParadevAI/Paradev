import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { jwt } from "better-auth/plugins";
import {
	isOAuthAccessTokenLive,
	revokeOAuthAccessTokenGrant,
	revokeOAuthRefreshTokenGrant,
} from "./oauth-grant";

const API_URL = "http://localhost:3998";
const CLIENT_ID = "superset-cli";

type Row = Record<string, unknown>;

async function setup() {
	const db: Record<string, Row[]> = {};
	const auth = betterAuth({
		baseURL: API_URL,
		secret: "oauth-grant-test-secret-0123456789abcdef",
		database: memoryAdapter(db),
		plugins: [
			jwt(),
			oauthProvider({
				loginPage: `${API_URL}/sign-in`,
				consentPage: `${API_URL}/consent`,
				validAudiences: [API_URL],
				silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
				isJwtAccessTokenLive: (ctx, payload) =>
					isOAuthAccessTokenLive(ctx.context.adapter, payload),
				onJwtAccessTokenRevoked: (ctx, payload) =>
					revokeOAuthAccessTokenGrant(ctx.context.adapter, payload),
				onRefreshTokenRevoked: (ctx, refreshToken) =>
					revokeOAuthRefreshTokenGrant(ctx.context.adapter, refreshToken),
			}),
		],
	});
	const ctx = await auth.$context;
	for (const model of Object.keys(ctx.tables)) db[model] ??= [];
	const user = await ctx.internalAdapter.createUser({
		email: "grant@test.local",
		name: "Grant",
		emailVerified: true,
	});
	await ctx.adapter.create({
		model: "oauthClient",
		data: {
			clientId: CLIENT_ID,
			public: true,
			scopes: ["openid", "offline_access"],
			grantTypes: ["authorization_code", "refresh_token"],
			tokenEndpointAuthMethod: "none",
			redirectUris: ["http://127.0.0.1/callback"],
			createdAt: new Date(),
			updatedAt: new Date(),
		},
	});
	const newSession = async () =>
		(await ctx.internalAdapter.createSession(user.id)).id;
	const seedRefreshToken = (token: string, sessionId: string) =>
		ctx.adapter.create({
			model: "oauthRefreshToken",
			data: {
				token: createHash("sha256").update(token).digest("base64url"),
				clientId: CLIENT_ID,
				userId: user.id,
				sessionId,
				scopes: ["openid", "offline_access"],
				createdAt: new Date(),
				expiresAt: new Date(Date.now() + 86_400_000),
			},
		});
	const post = (path: string, body: Record<string, string>) =>
		auth.handler(
			new Request(`${API_URL}/api/auth${path}`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
			}),
		);
	const refresh = async (refreshToken: string) => {
		const res = await post("/oauth2/token", {
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			resource: API_URL,
		});
		return {
			status: res.status,
			body: (await res.json()) as {
				access_token: string;
				refresh_token: string;
			},
		};
	};
	const revoke = (token: string, hint: "access_token" | "refresh_token") =>
		post("/oauth2/revoke", { token, token_type_hint: hint });
	const userinfo = (accessToken: string) =>
		auth.handler(
			new Request(`${API_URL}/api/auth/oauth2/userinfo`, {
				headers: { Authorization: `Bearer ${accessToken}` },
			}),
		);
	const isLive = (accessToken: string) =>
		isOAuthAccessTokenLive(
			ctx.adapter,
			JSON.parse(
				Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString(),
			),
		);
	return { newSession, seedRefreshToken, refresh, revoke, userinfo, isLive };
}

describe("OAuth grant revocation", () => {
	test("revoking a refresh and access token stops the access token and the forked sibling", async () => {
		const t = await setup();
		const session = await t.newSession();
		await t.seedRefreshToken("rotated", session);
		await t.seedRefreshToken("forked-sibling", session);

		const { body } = await t.refresh("rotated");
		expect((await t.userinfo(body.access_token)).status).toBe(200);
		expect(await t.isLive(body.access_token)).toBe(true);

		expect((await t.revoke(body.refresh_token, "refresh_token")).status).toBe(
			200,
		);
		expect((await t.revoke(body.access_token, "access_token")).status).toBe(
			200,
		);

		expect((await t.userinfo(body.access_token)).status).toBe(401);
		expect(await t.isLive(body.access_token)).toBe(false);
		expect((await t.refresh("forked-sibling")).status).toBe(400);
	});

	test("revoking only an access token stops it and leaves other logins working", async () => {
		const t = await setup();
		await t.seedRefreshToken("machine-a", await t.newSession());
		await t.seedRefreshToken("machine-b", await t.newSession());
		const a = (await t.refresh("machine-a")).body;
		const b = (await t.refresh("machine-b")).body;

		expect((await t.revoke(a.access_token, "access_token")).status).toBe(200);

		expect(await t.isLive(a.access_token)).toBe(false);
		expect((await t.refresh(a.refresh_token)).status).toBe(400);
		expect(await t.isLive(b.access_token)).toBe(true);
		expect((await t.refresh(b.refresh_token)).status).toBe(200);
	});
});
