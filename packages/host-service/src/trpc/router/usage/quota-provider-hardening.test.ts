import { afterEach, expect, test } from "bun:test";
import { fetchClaudeSubscriptionQuota, getCredentialQuota } from "./claude";
import { getCodexCredentialQuota } from "./codex";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("optional Claude profile deadline cannot discard successful primary quota", async () => {
	const calls: string[] = [];
	globalThis.fetch = (async (input, init) => {
		calls.push(String(input));
		expect(init?.cache).toBe("no-store");
		expect(init?.redirect).toBe("error");
		return Response.json({
			five_hour: {
				utilization: 42,
				resets_at: new Date(Date.now() + 1000).toISOString(),
			},
		});
	}) as typeof fetch;
	const result = await fetchClaudeSubscriptionQuota(
		"synthetic-optional-budget",
		{ primaryMs: 8000, profileMs: 0 },
	);
	expect(result.status).toBe("ok");
	expect(result.windows[0]?.usedPercent).toBe(42);
	expect(result.email).toBeNull();
	expect(calls).toHaveLength(1);
});

test("Claude Retry-After cannot be bypassed through another profile alias or force refresh", async () => {
	let usageRequests = 0;
	globalThis.fetch = (async (input) => {
		if (String(input).endsWith("/profile"))
			return Response.json({ email: "synthetic@example.test" });
		usageRequests++;
		return new Response("limited", {
			status: 429,
			headers: { "Retry-After": "600" },
		});
	}) as typeof fetch;
	const credential = {
		accessToken: "synthetic-claude-pause-alias",
		expiresAt: null,
		refreshTokenExpiresAt: null,
		subscriptionType: null,
		accountKey: "a",
		sourceLabel: "a",
		selection: "/synthetic/a",
	};
	const first = await getCredentialQuota(credential, true);
	const alias = await getCredentialQuota(
		{ ...credential, accountKey: "b", selection: "/synthetic/b" },
		true,
	);
	expect(first.status).toBe("unavailable");
	expect(alias).toBe(first);
	expect(usageRequests).toBe(1);
	expect(JSON.stringify(alias)).not.toContain(credential.accessToken);
});

test("Codex account header isolates a paused organization while profile aliases share its pause", async () => {
	const requests: Array<{ path: string; account: string }> = [];
	globalThis.fetch = (async (input, init) => {
		const account = new Headers(init?.headers).get("chatgpt-account-id") ?? "";
		requests.push({ path: new URL(String(input)).pathname, account });
		if (account === "paused")
			return new Response("limited", {
				status: 429,
				headers: { "Retry-After": "600" },
			});
		return Response.json({
			rate_limit: {
				primary_window: { used_percent: 20, reset_after_seconds: 300 },
			},
		});
	}) as typeof fetch;
	const first = await getCodexCredentialQuota(
		"synthetic-codex-header-pause",
		"paused",
		"/synthetic/a",
		true,
	);
	const alias = await getCodexCredentialQuota(
		"synthetic-codex-header-pause",
		"paused",
		"/synthetic/b",
		true,
	);
	const healthy = await getCodexCredentialQuota(
		"synthetic-codex-header-pause",
		"healthy",
		"/synthetic/c",
		true,
	);
	expect(first.status).toBe("unavailable");
	expect(alias).toBe(first);
	expect(healthy.status).toBe("ok");
	expect(requests.filter((request) => request.path.endsWith("/usage"))).toEqual(
		[
			{ path: "/backend-api/wham/usage", account: "paused" },
			{ path: "/backend-api/wham/usage", account: "healthy" },
		],
	);
	expect(
		requests.filter((request) => !request.path.endsWith("/usage")),
	).toEqual([
		{
			path: "/backend-api/wham/rate-limit-reset-credits",
			account: "healthy",
		},
	]);
});
