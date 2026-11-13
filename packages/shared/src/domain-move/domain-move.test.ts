import { describe, expect, mock, test } from "bun:test";
import { domainMoveTarget, withDomainMove } from "./domain-move";

const web = (path = "/dashboard", init: RequestInit = {}) =>
	new Request(`https://app.superset.sh${path}`, {
		headers: { accept: "text/html" },
		...init,
	});
const legacy = () =>
	Promise.resolve(
		new Response("legacy", { headers: { "x-legacy": "unchanged" } }),
	);
const cookie = "__Secure-domain-move-id=12345678-1234-4123-8123-123456789abc";

describe("domain move policy", () => {
	test("only exact old origins are sources, independent of forwarded headers", () => {
		for (const origin of [
			"https://app.paradev.com",
			"https://app.stage.paradev.com",
			"https://app.pr-1.paradev.com",
			"http://localhost:3000",
			"https://app.superset.sh.evil.test",
			"https://app.superset.sh:444",
			"http://app.superset.sh",
		]) {
			expect(
				domainMoveTarget(
					new Request(`${origin}/`, {
						headers: {
							accept: "text/html",
							"x-forwarded-host": "app.superset.sh",
						},
					}),
					"web",
				),
			).toBeNull();
		}
		expect(
			domainMoveTarget(
				web("/dashboard", {
					headers: { accept: "text/html", "x-forwarded-host": "evil.test" },
				}),
				"web",
			),
		).toBeNull();
		expect(
			domainMoveTarget(
				web("/dashboard", {
					headers: { accept: "text/html", host: "evil.test" },
				}),
				"web",
			),
		).toBeNull();
	});

	test("retains protocol, auth, billing, invitation and asset routes with boundaries", () => {
		for (const path of [
			"/api",
			"/trpc",
			"/oauth",
			"/cli/auth",
			"/auth/desktop",
			"/auth/integration-connect",
			"/integrations/sentry",
			"/.well-known",
			"/mcp",
			"/accept-invitation",
			"/settings/billing",
			"/_next",
			"/ingest",
			"/monitoring",
		]) {
			for (const suffix of ["", "/child", "?success=true", "?cancel=true"])
				expect(domainMoveTarget(web(path + suffix), "web")).toBeNull();
		}
		for (const path of [
			"/",
			"/?success=true",
			"/image.png",
			"/robots.txt",
			"/%61pi/auth",
			"/settings%2Fbilling",
			"/broken%zz",
		])
			expect(domainMoveTarget(web(path), "web")).toBeNull();
		for (const path of ["/api-keys", "/page/123", "/workspaces/123"])
			expect(domainMoveTarget(web(path), "web")?.pathname).toBe(path);
	});

	test("retains encoded, absolute and nested protected sign-in/up continuations", () => {
		for (const page of ["/sign-in", "/sign-up"]) {
			for (const path of [
				"/",
				"/oauth/consent?client_id=123",
				"/cli/auth/code",
				"/auth/desktop/success",
				"/auth/integration-connect?provider=sentry&organizationId=803f13a4-49b9-4664-826f-4090c750b0bc",
				"/integrations/sentry",
				"/settings/billing?success=true",
				"/settings/billing",
				"/accept-invitation/id",
			]) {
				for (const redirect of [
					path,
					`https://app.superset.sh${path}`,
					encodeURIComponent(path),
					`/sign-in?redirect=${encodeURIComponent(path)}`,
				]) {
					expect(
						domainMoveTarget(
							web(`${page}?redirect=${encodeURIComponent(redirect)}`),
							"web",
						),
					).toBeNull();
				}
			}
			for (const redirect of [
				"https://evil.test",
				"//evil.test",
				"/\t/evil.test",
				"/\\evil.test",
				"/%252F%252Fevil.test",
			])
				expect(
					domainMoveTarget(
						web(`${page}?redirect=${encodeURIComponent(redirect)}`),
						"web",
					),
				).toBeNull();
		}
		expect(
			domainMoveTarget(web("/sign-in?redirect=%2Fapi-keys"), "web")?.hostname,
		).toBe("app.paradev.com");
	});

	test("only browser document GET/HEAD moves; RSC, prefetch and actions remain", () => {
		for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
			expect(
				domainMoveTarget(
					web("/dashboard", { method, headers: { accept: "text/html" } }),
					"web",
				),
			).toBeNull();
		for (const headers of [
			{ rsc: "1" },
			{ "next-action": "id" },
			{ "next-router-prefetch": "1" },
			{ "next-router-state-tree": "[]" },
			{ "next-router-segment-prefetch": "/" },
			{ purpose: "prefetch" },
			{ "sec-purpose": "prefetch;prerender" },
			{ "sec-fetch-dest": "empty" },
			{ "sec-fetch-mode": "cors" },
			{ accept: "application/json" },
			{ accept: "text/html;q=0" },
		] as Record<string, string>[])
			expect(
				domainMoveTarget(
					web("/dashboard", { headers: { accept: "text/html", ...headers } }),
					"web",
				),
			).toBeNull();
		expect(domainMoveTarget(web("/dashboard?_rsc=abc"), "web")).toBeNull();
		expect(
			domainMoveTarget(web("/dashboard", { headers: {} }), "web"),
		).toBeNull();
		for (const method of ["GET", "HEAD"])
			expect(
				domainMoveTarget(
					web("/foo?a=%2f&b=1+2&a=3", {
						method,
						headers: { accept: "text/html" },
					}),
					"web",
				)?.href,
			).toBe("https://app.paradev.com/foo?a=%2f&b=1+2&a=3");
		expect(domainMoveTarget(web("//evil.test/path"), "web")).toBeNull();
	});

	test("desktop source is exact GET and cannot recurse at destination", () => {
		for (const url of [
			"https://api.paradev.com/api/auth/desktop/connect",
			"https://api.stage.paradev.com/api/auth/desktop/connect",
			"https://api.superset.sh/api/auth/desktop/connect/",
			"https://api.superset.sh/api/auth/callback/google",
		])
			expect(domainMoveTarget(new Request(url), "desktop")).toBeNull();
		expect(
			domainMoveTarget(
				new Request("https://api.superset.sh/api/auth/desktop/connect", {
					method: "HEAD",
				}),
				"desktop",
			),
		).toBeNull();
	});
});

describe("domain move evaluation", () => {
	test("OAuth-provider sign-in and sign-up stay on legacy without flag lookup at full rollout", async () => {
		const lookup = mock(async () => true);
		for (const page of ["/sign-in", "/sign-up"]) {
			for (const query of [
				"client_id=cli-client&sig=signed-request",
				"client_id=cli-client",
				"sig=signed-request",
				"client_id=",
				"sig=",
				"%63lient_id=cli-client&redirect=%2Fdashboard",
			]) {
				for (const path of [
					`${page}?${query}`,
					`/sign-in?redirect=${encodeURIComponent(`${page}?${query}`)}`,
				]) {
					const original = new Response("legacy OAuth login");
					const response = await withDomainMove({
						request: web(path),
						surface: "web",
						enabled: "true",
						lookup,
						fallback: async () => original,
					});
					expect(response).toBe(original);
					expect(response.headers.get("set-cookie")).toBeNull();
				}
			}
			expect(domainMoveTarget(web(page), "web")?.hostname).toBe(
				"app.paradev.com",
			);
		}
		expect(lookup).not.toHaveBeenCalled();
	});

	test("off is byte-equivalent, with no lookup or cookie even if flag would be true", async () => {
		const lookup = mock(async () => true);
		for (const enabled of [undefined, "", "false", "TRUE", "1"]) {
			const original = new Response("legacy", { status: 201 });
			const response = await withDomainMove({
				request: web(),
				surface: "web",
				enabled,
				lookup,
				fallback: async () => original,
			});
			expect(response).toBe(original);
			expect(response.headers.get("set-cookie")).toBeNull();
		}
		expect(lookup).not.toHaveBeenCalled();
	});

	test("excluded requests do not evaluate or create cookies when enabled", async () => {
		const lookup = mock(async () => true);
		const response = await withDomainMove({
			request: web("/settings/billing"),
			surface: "web",
			enabled: "true",
			lookup,
			fallback: legacy,
		});
		expect(lookup).not.toHaveBeenCalled();
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	test("false, absent, variants, failure and deadline retain legacy with functional cohort cookie", async () => {
		for (const value of [false, undefined, null, "true", "variant", 1]) {
			const response = await withDomainMove({
				request: web(),
				surface: "web",
				enabled: "true",
				lookup: async () => value,
				fallback: legacy,
			});
			expect(await response.text()).toBe("legacy");
			expect(response.headers.get("set-cookie")).toContain(
				"Domain=superset.sh",
			);
			expect(response.headers.get("cache-control")).toBe("private, no-store");
		}
		const failed = await withDomainMove({
			request: web(),
			surface: "web",
			enabled: "true",
			lookup: async () => {
				throw Error("offline");
			},
			fallback: legacy,
		});
		expect(await failed.text()).toBe("legacy");
		const schedule = ((callback: () => void) => {
			queueMicrotask(callback);
			return 0;
		}) as unknown as typeof setTimeout;
		const timedOut = await withDomainMove({
			request: web(),
			surface: "web",
			enabled: "true",
			lookup: () => new Promise(() => {}),
			fallback: legacy,
			schedule,
		});
		expect(await timedOut.text()).toBe("legacy");
	});

	test("first-time browser gets a stable shared cohort even when excluded by percentage", async () => {
		const ids: string[] = [];
		const lookup = mock(
			async (
				key: string,
				id: string,
				options: { sendFeatureFlagEvents: false },
			) => {
				expect(key).toBe("web-domain-move");
				expect(options).toEqual({ sendFeatureFlagEvents: false });
				ids.push(id);
				return false;
			},
		);
		const first = await withDomainMove({
			request: web(),
			surface: "web",
			enabled: "true",
			lookup,
			fallback: legacy,
		});
		const stored = first.headers.get("set-cookie")?.split(";")[0] ?? "";
		const second = await withDomainMove({
			request: new Request("https://api.superset.sh/api/auth/desktop/connect", {
				headers: { cookie: stored },
			}),
			surface: "desktop",
			enabled: "true",
			lookup,
			fallback: legacy,
		});
		expect(ids[0]).toBe(ids[1]);
		expect(ids[0]).toMatch(/^[0-9a-f-]{36}$/);
		expect(second.headers.get("set-cookie")).toBeNull();
	});

	test("true redirects with no-store using the browser cohort and destination stays put", async () => {
		const lookup = mock(async (_key: string, id: string) => {
			expect(id).toBe("12345678-1234-4123-8123-123456789abc");
			return true;
		});
		const fallback = mock(legacy);
		const response = await withDomainMove({
			request: web("/api-keys?a=%2f&a=two+words", {
				headers: { accept: "text/html", cookie },
			}),
			surface: "web",
			enabled: "true",
			lookup,
			fallback,
		});
		expect(response.status).toBe(307);
		expect(response.headers.get("location")).toBe(
			"https://app.paradev.com/api-keys?a=%2f&a=two+words",
		);
		expect(response.headers.get("cache-control")).toBe("private, no-store");
		expect(response.headers.get("set-cookie")).toBeNull();
		expect(fallback).not.toHaveBeenCalled();
		expect(
			domainMoveTarget(
				new Request(response.headers.get("location") ?? "", {
					headers: { accept: "text/html" },
				}),
				"web",
			),
		).toBeNull();
	});
});
