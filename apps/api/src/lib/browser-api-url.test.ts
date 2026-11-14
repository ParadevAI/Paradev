import { expect, test } from "bun:test";

const identityUrl = "https://api.superset.sh";

for (const browserUrl of [
	undefined,
	"",
	"https://api.paradev.com",
	"http://localhost:3001",
]) {
	test(`OAuth browser URLs preserve token identity with BROWSER_API_URL=${browserUrl}`, () => {
		const env = {
			...process.env,
			NEXT_PUBLIC_API_URL: identityUrl,
			BROWSER_API_URL: browserUrl,
			PLUGIN_CLIENT_METADATA_BASE_URL:
				browserUrl === "" ? "https://metadata.test" : undefined,
			SKIP_ENV_VALIDATION: "1",
		};
		if (browserUrl === undefined) delete env.BROWSER_API_URL;
		const result = Bun.spawnSync(
			[
				process.execPath,
				"--eval",
				`
			const { auth } = await import("@superset/auth/server");
			const { redirectUriFor, clientMetadataUrl } = await import("../../packages/trpc/src/lib/connectors/client-identity.ts");
			const { githubUserCallbackUrl } = await import("../../packages/trpc/src/lib/github-user/github-user.ts");
			const { setStateCookie, STATE_COOKIES } = await import("./src/lib/integrations/oauthFlow.ts");
			const { GET: clientMetadata } = await import("./src/app/api/connectors/[connector]/client-metadata/route.ts");
			const clientDocument = await (await clientMetadata(new Request("https://metadata.test"), { params: Promise.resolve({ connector: "google" }) })).json();
			const { GET: protectedMetadata } = await import("./src/app/.well-known/oauth-protected-resource/[...path]/route.ts");
 const protectedDocument = await (await protectedMetadata(new Request("https://api.paradev.com/.well-known/oauth-protected-resource/mcp"), { params: Promise.resolve({ path: ["mcp"] }) })).json();
 const dbUtils = await import("@superset/db/utils");
 const { spyOn } = await import("bun:test");
 spyOn(dbUtils, "findOrgMembership").mockImplementation(async () => ({ role: "member" }));
 auth.api.getSession = async () => ({ user: { id: "user-1" } });
 const { GET: connectGoogle } = await import("./src/app/api/integrations/google/connect/route.ts");
 const { GET: callbackGoogle } = await import("./src/app/api/integrations/google/callback/route.ts");
 const start = await connectGoogle(new Request("https://api.test/api/integrations/google/connect?organizationId=org-1"));
 const authorization = new URL(start.headers.get("location"));
 const callback = new URL(authorization.searchParams.get("redirect_uri"));
 callback.searchParams.set("code", "code");
 callback.searchParams.set("state", authorization.searchParams.get("state"));
 let exchangeRedirect;
 globalThis.fetch = async (_url, init) => {
  exchangeRedirect = new URLSearchParams(init.body).get("redirect_uri");
  return new Response("{}", { status: 400 });
 };
 await callbackGoogle(new Request(callback, { headers: { cookie: start.headers.get("set-cookie").split(";")[0] } }));
 const jwt = auth.options.plugins.find(p => p.id === "jwt").options.jwt;
			const oauth = auth.options.plugins.find(p => p.id === "oauth-provider").options;
			console.log(JSON.stringify({
				baseURL: auth.options.baseURL,
				clientDocument,
				protectedDocument,
				authorizationRedirect: authorization.searchParams.get("redirect_uri"),
				exchangeRedirect,
				metadata: await auth.api.getOAuthServerConfig(),
				openid: await auth.api.getOpenIdConfig(),
				issuer: jwt.issuer,
				audience: jwt.audience,
				validAudiences: oauth.validAudiences,
				connectorRedirect: redirectUriFor("test"),
				clientMetadata: clientMetadataUrl("test"),
				githubRedirect: githubUserCallbackUrl(),
				cookie: setStateCookie(STATE_COOKIES.google, "state"),
				trustedOrigins: await auth.options.trustedOrigins(),
			}));
		`,
			],
			{ cwd: new URL("../../", import.meta.url).pathname, env },
		);
		expect(result.exitCode, result.stderr.toString()).toBe(0);
		const config = JSON.parse(result.stdout.toString().trim());
		const expectedUrl = browserUrl || identityUrl;
		const metadataUrl =
			browserUrl === "" ? "https://metadata.test" : identityUrl;
		expect(config.baseURL).toBe(expectedUrl);
		expect(config.authorizationRedirect).toBe(
			`${expectedUrl}/api/integrations/google/callback`,
		);
		expect(config.exchangeRedirect).toBe(config.authorizationRedirect);
		expect(config.protectedDocument.resource).toBe(`${identityUrl}/mcp`);
		expect(config.protectedDocument.authorization_servers).toEqual([
			identityUrl,
		]);
		expect(config.clientDocument.client_id).toBe(
			`${metadataUrl}/api/connectors/google/client-metadata`,
		);
		expect(config.clientDocument.redirect_uris).toContain(
			`${expectedUrl}/api/connectors/callback/google`,
		);
		if (expectedUrl.startsWith("https")) {
			expect(config.clientDocument.redirect_uris).toContain(
				"https://api.superset.sh/api/connectors/callback/google",
			);
			expect(config.clientDocument.redirect_uris).toContain(
				"https://api.paradev.com/api/connectors/callback/google",
			);
		}
		expect(config.issuer).toBe(identityUrl);
		for (const metadata of [config.metadata, config.openid]) {
			expect(metadata.issuer).toBe(identityUrl);
			for (const [key, path] of Object.entries({
				token_endpoint: "oauth2/token",
				jwks_uri: "jwks",
				registration_endpoint: "oauth2/register",
				introspection_endpoint: "oauth2/introspect",
				revocation_endpoint: "oauth2/revoke",
			})) {
				expect(metadata[key]).toBe(`${expectedUrl}/api/auth/${path}`);
			}
			expect(metadata.authorization_endpoint).toBe(
				`${expectedUrl}/api/auth/oauth2/authorize`,
			);
		}
		expect(config.audience).toBe(identityUrl);
		expect(config.openid.userinfo_endpoint).toBe(
			`${expectedUrl}/api/auth/oauth2/userinfo`,
		);
		expect(config.openid.end_session_endpoint).toBe(
			`${expectedUrl}/api/auth/oauth2/end-session`,
		);
		expect(config.validAudiences).toEqual([
			identityUrl,
			`${identityUrl}/`,
			`${identityUrl}/api/v2/agent/mcp`,
			`${identityUrl}/mcp`,
		]);
		expect(config.connectorRedirect).toBe(
			`${expectedUrl}/api/connectors/callback/test`,
		);
		expect(config.githubRedirect).toBe(
			`${expectedUrl}/api/github/user/callback`,
		);
		expect(config.clientMetadata).toBe(
			`${metadataUrl}/api/connectors/test/client-metadata`,
		);
		expect(config.cookie.includes(" Secure;")).toBe(
			expectedUrl.startsWith("https"),
		);
		expect(config.trustedOrigins).toContain(expectedUrl);
	});
}
