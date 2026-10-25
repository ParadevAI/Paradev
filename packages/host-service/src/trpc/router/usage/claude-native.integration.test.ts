import { afterAll, expect, mock, setSystemTime, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

mock.module("./profiles", () => ({
	discoverClaudeProfiles: async () => [],
	keychainServicesForConfigDir: () => [],
	readKeychainSecrets: async () => [],
}));
const directory = mkdtempSync(join(tmpdir(), "native-quota-integration-"));
const profile = join(directory, "profile");
mkdirSync(profile, { mode: 0o700 });
const originalHome = process.env.HOME;
const originalSuperset = process.env.SUPERSET_HOME_DIR;
const originalFlag = process.env.SUPERSET_NATIVE_CLAUDE_USAGE;
const originalFetch = globalThis.fetch;
const initial = Date.now();
const principal = "11111111-1111-4111-8111-111111111111";
const organization = "22222222-2222-4222-8222-222222222222";
const email = "fixture@example.test";
const token = "disposable-fixture-only";
process.env.HOME = directory;
process.env.SUPERSET_HOME_DIR = join(directory, "superset");
process.env.SUPERSET_NATIVE_CLAUDE_USAGE = "1";
writeFileSync(
	join(profile, ".credentials.json"),
	JSON.stringify({
		claudeAiOauth: {
			accessToken: token,
			expiresAt: initial + 8 * 60 * 60_000,
			subscriptionType: "max",
		},
	}),
	{ mode: 0o600 },
);
writeFileSync(
	join(profile, ".claude.json"),
	JSON.stringify({
		oauthAccount: { accountUuid: principal, emailAddress: email },
	}),
	{ mode: 0o600 },
);
let usageRequests = 0;
const reset = Math.floor((initial + 5 * 60 * 60_000) / 1000);
const weekly = Math.floor((initial + 7 * 24 * 60 * 60_000) / 1000);
globalThis.fetch = mock(async (input: string | URL | Request) => {
	const url = input instanceof Request ? input.url : String(input);
	if (url === "https://api.anthropic.com/api/oauth/usage") {
		usageRequests++;
		return Response.json({
			five_hour: {
				utilization: 10,
				resets_at: new Date(reset * 1000).toISOString(),
			},
			seven_day: {
				utilization: 15,
				resets_at: new Date(weekly * 1000).toISOString(),
			},
		});
	}
	if (url === "https://api.anthropic.com/api/oauth/profile")
		return Response.json({
			account: { uuid: principal, email },
			organization: { uuid: organization },
		});
	return new Response(null, { status: 503 });
}) as unknown as typeof fetch;
setSystemTime(initial);
afterAll(() => {
	globalThis.fetch = originalFetch;
	setSystemTime();
	if (originalHome === undefined) delete process.env.HOME;
	else process.env.HOME = originalHome;
	if (originalSuperset === undefined) delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = originalSuperset;
	if (originalFlag === undefined)
		delete process.env.SUPERSET_NATIVE_CLAUDE_USAGE;
	else process.env.SUPERSET_NATIVE_CLAUDE_USAGE = originalFlag;
	rmSync(directory, { recursive: true, force: true });
});
const {
	getCredentialQuota,
	captureNativeClaudeUsageGeneration,
	resolveNativeClaudeUsageScope,
	disposeClaudeQuotaCollection,
} = await import("./claude");
const { nativeClaudeUsage } = await import("./native-claude-usage");
test("actual credential reader uses fresh bound native windows without another usage request", async () => {
	const credential = {
		accessToken: token,
		expiresAt: initial + 8 * 60 * 60_000,
		refreshTokenExpiresAt: null,
		hasRefreshToken: false,
		subscriptionType: "max",
		accountKey: profile,
		sourceLabel: "fixture",
		selection: profile,
		email,
	};
	try {
		const http = await getCredentialQuota(credential, true, "blocking");
		expect(http.status).toBe("ok");
		expect(usageRequests).toBe(1);
		const identity = createHash("sha256")
			.update(JSON.stringify([principal, undefined, email]))
			.digest("hex");
		const generation = await captureNativeClaudeUsageGeneration(
			profile,
			profile,
			identity,
		);
		expect(generation).not.toBeNull();
		if (!generation) throw new Error("missing generation");
		const scope = await resolveNativeClaudeUsageScope(
			profile,
			profile,
			identity,
			generation,
		);
		expect(scope).not.toBeNull();
		if (!scope) throw new Error("missing authenticated scope");
		const launch = {
			launchId: "owned-integration-launch",
			sessionId: "owned-integration-session",
			generation,
		};
		nativeClaudeUsage.captureLaunch(launch);
		nativeClaudeUsage.promoteLaunch({ ...launch, scope });
		nativeClaudeUsage.ingest({
			receivedAt: Date.now(),
			...launch,
			scope,
			source: "claude_statusline",
			payload: { cost: { total_api_duration_ms: 0 } },
		});
		setSystemTime(initial + 16 * 60_000);
		nativeClaudeUsage.ingest({
			receivedAt: Date.now(),
			...launch,
			scope,
			source: "claude_statusline",
			payload: {
				cost: { total_api_duration_ms: 1 },
				rate_limits: {
					five_hour: { used_percentage: 25, resets_at: reset },
					seven_day: { used_percentage: 30, resets_at: weekly },
				},
			},
		});
		const native = await getCredentialQuota(credential, false, "background");
		expect(native.windows.map((window) => window.usedPercent)).toEqual([
			25, 30,
		]);
		expect(
			native.windows.every((window) => window.source === "claude_statusline"),
		).toBe(true);
		expect(native.fetchedAt).toEqual(http.fetchedAt);
		expect(usageRequests).toBe(1);
		const forced = await getCredentialQuota(credential, true, "blocking");
		expect(forced.windows.map((window) => window.usedPercent)).toEqual([
			10, 15,
		]);
		expect(usageRequests).toBe(2);
	} finally {
		await disposeClaudeQuotaCollection();
	}
});
