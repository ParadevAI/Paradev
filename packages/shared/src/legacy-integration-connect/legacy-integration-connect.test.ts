import { expect, mock, test } from "bun:test";
import { withDomainMove } from "../domain-move";
import {
	continueLegacyIntegrationConnect,
	withLegacyIntegrationConnect,
} from "./legacy-integration-connect";

const orgId = "803f13a4-49b9-4664-826f-4090c750b0bc";
const connectPath = `/api/integrations/sentry/connect?organizationId=${orgId}`;
const continuationPath = `/auth/integration-connect?provider=sentry&organizationId=${orgId}`;
const request = (url: string, init: RequestInit = {}) =>
	new Request(url, {
		headers: { accept: "text/html" },
		...init,
	});
const location = (response: Response) => {
	expect(response.status).toBe(307);
	expect(response.headers.get("cache-control")).toBe("private, no-store");
	expect(response.headers.get("set-cookie")).toBeNull();
	return response.headers.get("location") ?? "";
};

test.each([
	"sentry",
	"notion",
	"microsoft-teams",
])("%s hands off before OAuth, signs in on legacy, then authorizes the explicit org with rollout at 100%", async (provider) => {
	const connectPath = `/api/integrations/${provider}/connect?organizationId=${orgId}`;
	const continuationPath = `/auth/integration-connect?provider=${provider}&organizationId=${orgId}`;
	for (const origin of [
		"https://api.paradev.com",
		"https://api.stage.paradev.com",
	]) {
		const beginOAuth = mock(
			async () =>
				new Response(null, {
					status: 302,
					headers: {
						location: "https://sentry.io/install",
						"set-cookie": "sentry_oauth_state=legacy-only",
					},
				}),
		);
		const moved = await withLegacyIntegrationConnect(
			request(`${origin}${connectPath}`),
			beginOAuth,
		);
		expect(beginOAuth).not.toHaveBeenCalled();
		const continuation = location(moved);
		expect(continuation).toBe(`https://app.superset.sh${continuationPath}`);

		const flag = mock(async () => true);
		const legacyWeb = (url: string, signedIn: boolean) =>
			withDomainMove({
				request: request(url),
				enabled: "true",
				surface: "web",
				lookup: flag,
				fallback: () =>
					continueLegacyIntegrationConnect(request(url), async () => signedIn),
			});
		const signIn = new URL(location(await legacyWeb(continuation, false)));
		expect(signIn.origin + signIn.pathname).toBe(
			"https://app.superset.sh/sign-in",
		);
		expect(signIn.searchParams.get("redirect")).toBe(continuationPath);
		const signInPage = new Response("existing sign-in");
		expect(
			await withDomainMove({
				request: request(signIn.href),
				enabled: "true",
				surface: "web",
				lookup: flag,
				fallback: async () => signInPage,
			}),
		).toBe(signInPage);

		const resumed = new URL(
			signIn.searchParams.get("redirect") ?? "",
			signIn.origin,
		);
		const oldApi = location(await legacyWeb(resumed.href, true));
		expect(oldApi).toBe(`https://api.superset.sh${connectPath}`);
		const memberCheck = mock(async () => {
			expect(new URL(oldApi).searchParams.get("organizationId")).toBe(orgId);
			return beginOAuth();
		});
		const authorized = await withLegacyIntegrationConnect(
			request(oldApi),
			memberCheck,
		);
		expect(memberCheck).toHaveBeenCalledTimes(1);
		expect(beginOAuth).toHaveBeenCalledTimes(1);
		expect(authorized.headers.get("set-cookie")).toBe(
			"sentry_oauth_state=legacy-only",
		);

		const resultPage = new Response("existing integration result");
		expect(
			await withDomainMove({
				request: request(
					`https://app.superset.sh/integrations/${provider}?error=not_configured`,
				),
				enabled: "true",
				surface: "web",
				lookup: flag,
				fallback: async () => resultPage,
			}),
		).toBe(resultPage);
		expect(flag).not.toHaveBeenCalled();
	}
});

test("handoff only carries the explicit org and provider, never credentials, state, or redirect input", async () => {
	const credentials =
		"&token=do-not-forward&state=do-not-forward&redirect=https://evil.test";
	const originalFlow = mock(async () => new Response("should not start"));
	const response = await withLegacyIntegrationConnect(
		request(`https://api.paradev.com${connectPath}${credentials}`, {
			headers: {
				authorization: "Bearer do-not-forward",
				cookie: "session=do-not-forward",
			},
		}),
		originalFlow,
	);
	expect(location(response)).toBe(`https://app.superset.sh${continuationPath}`);
	const isSignedIn = mock(async () => true);
	const target = await continueLegacyIntegrationConnect(
		request(`https://app.superset.sh${continuationPath}${credentials}`),
		isSignedIn,
	);
	expect(location(target)).toBe(`https://api.superset.sh${connectPath}`);
	expect(isSignedIn).toHaveBeenCalledTimes(1);
	expect(originalFlow).not.toHaveBeenCalled();
});

test("invalid or ambiguous organization input fails before session reads or OAuth", async () => {
	for (const query of [
		"",
		"organizationId=",
		"organizationId=not-a-uuid",
		`organizationId=${orgId}&organizationId=${orgId}`,
		"organizationId=https%3A%2F%2Fevil.test",
		`organizationId=${orgId}%0A`,
	]) {
		const startOAuth = mock(async () => new Response("OAuth"));
		const isSignedIn = mock(async () => true);
		const api = await withLegacyIntegrationConnect(
			request(
				`https://api.paradev.com/api/integrations/sentry/connect?${query}`,
			),
			startOAuth,
		);
		const web = await continueLegacyIntegrationConnect(
			request(
				`https://app.superset.sh/auth/integration-connect?provider=sentry&${query}`,
			),
			isSignedIn,
		);
		for (const response of [api, web]) {
			expect(response.status).toBe(400);
			expect(response.headers.get("location")).toBeNull();
			expect(response.headers.get("set-cookie")).toBeNull();
		}
		expect(startOAuth).not.toHaveBeenCalled();
		expect(isSignedIn).not.toHaveBeenCalled();
	}
});

test("continuation accepts only one allowlisted provider", async () => {
	for (const query of [
		"",
		"provider=",
		"provider=slack",
		"provider=google",
		"provider=Sentry",
		"provider=https%3A%2F%2Fevil.test",
		"provider=sentry&provider=slack",
	]) {
		const session = mock(async () => true);
		const response = await continueLegacyIntegrationConnect(
			request(
				`https://app.superset.sh/auth/integration-connect?organizationId=${orgId}&${query}`,
			),
			session,
		);
		expect(response.status).toBe(400);
		expect(session).not.toHaveBeenCalled();
	}
});

test("continuation rejects foreign hosts and spoofed forwarded hosts before reading a session", async () => {
	const session = mock(async () => true);
	for (const origin of [
		"https://app.paradev.com",
		"https://app.stage.paradev.com",
		"https://app.pr-1.paradev.com",
		"http://localhost:3000",
		"https://app.superset.sh:444",
		"http://app.superset.sh",
		"https://app.superset.sh.evil.test",
	]) {
		const response = await continueLegacyIntegrationConnect(
			request(`${origin}${continuationPath}`, {
				headers: { "x-forwarded-host": "app.superset.sh" },
			}),
			session,
		);
		expect(response.status).toBe(404);
	}
	for (const header of ["host", "x-forwarded-host"]) {
		const response = await continueLegacyIntegrationConnect(
			request(`https://app.superset.sh${continuationPath}`, {
				headers: { [header]: "evil.test" },
			}),
			session,
		);
		expect(response.status).toBe(404);
		const oauth = mock(async () => new Response("OAuth"));
		const moved = await withLegacyIntegrationConnect(
			request(`https://api.paradev.com${connectPath}`, {
				headers: { [header]: "evil.test" },
			}),
			oauth,
		);
		expect(moved.status).toBe(400);
		expect(oauth).not.toHaveBeenCalled();
	}
	expect(session).not.toHaveBeenCalled();
});

test("legacy, local, preview, foreign sources and unrelated provider starts keep the exact original response", async () => {
	for (const url of [
		`https://api.superset.sh${connectPath}`,
		`http://localhost:3001${connectPath}`,
		`https://api.pr-1.paradev.com${connectPath}`,
		`https://api.paradev.com.evil.test${connectPath}`,
		`https://api.paradev.com:444${connectPath}`,
		`http://api.paradev.com${connectPath}`,
		`https://api.paradev.com/api/integrations/slack/connect?organizationId=${orgId}`,
	]) {
		const original = new Response("legacy", { status: 403 });
		const fallback = mock(async () => original);
		expect(
			await withLegacyIntegrationConnect(
				request(url, { headers: { "x-forwarded-host": "api.paradev.com" } }),
				fallback,
			),
		).toBe(original);
		expect(fallback).toHaveBeenCalledTimes(1);
	}
});

test("new routes do not start OAuth or read sessions for non-GET requests", async () => {
	for (const method of ["HEAD", "POST", "OPTIONS"]) {
		const oauth = mock(async () => new Response("OAuth"));
		const session = mock(async () => true);
		expect(
			(
				await withLegacyIntegrationConnect(
					request(`https://api.paradev.com${connectPath}`, { method }),
					oauth,
				)
			).status,
		).toBe(405);
		expect(
			(
				await continueLegacyIntegrationConnect(
					request(`https://app.superset.sh${continuationPath}`, { method }),
					session,
				)
			).status,
		).toBe(405);
		expect(oauth).not.toHaveBeenCalled();
		expect(session).not.toHaveBeenCalled();
	}
});
