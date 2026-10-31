import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	classifyCodexToken,
	dedupeCodexAccounts,
	fetchCodexAccounts,
	fetchCodexSubscriptionQuota,
} from "./codex";
import { PROFILE_CREATED_MARKER } from "./profiles";
import type { UsageAccount } from "./types";

const NOW = Date.parse("2026-09-11T12:00:00.000Z");
const HOUR_SECONDS = 60 * 60;

function accessToken(payload: Record<string, unknown>): string {
	const part = (value: unknown) =>
		Buffer.from(JSON.stringify(value)).toString("base64url");
	return `${part({ alg: "RS256", typ: "JWT" })}.${part(payload)}.signature`;
}

const roots: string[] = [];

/** A fake home dir holding the given `~/.codex*` dirs and their files. */
function tempHome(dirs: Record<string, Record<string, string>>): string {
	const home = mkdtempSync(join(tmpdir(), "superset-usage-codex-"));
	roots.push(home);
	for (const [dir, files] of Object.entries(dirs)) {
		mkdirSync(join(home, dir));
		for (const [name, content] of Object.entries(files)) {
			writeFileSync(join(home, dir, name), content);
		}
	}
	return home;
}

afterEach(() => {
	mock.restore();
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

function codexAccount(accountKey: string, email: string | null): UsageAccount {
	return {
		agent: "codex",
		credentialKind: "subscription",
		accountKey,
		sourceLabel: accountKey,
		email,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: false,
		fetchedAt: new Date(0),
	};
}

describe("dedupeCodexAccounts", () => {
	it("keeps a personal account and a workspace seat that share an email", () => {
		const personal = codexAccount("/home/.codex/auth.json", "dev@example.com");
		const workspace = codexAccount(
			"/home/.codex-work/auth.json",
			"dev@example.com",
		);
		expect(
			dedupeCodexAccounts([
				{ account: personal, chatgptAccountId: "personal-account" },
				{ account: workspace, chatgptAccountId: "workspace-account" },
			]),
		).toEqual([personal, workspace]);
	});

	it("keeps only the first home for one account signed in from several homes", () => {
		const first = codexAccount("/home/.codex/auth.json", "dev@example.com");
		const second = codexAccount(
			"/home/.codex-copy/auth.json",
			"dev@example.com",
		);
		expect(
			dedupeCodexAccounts([
				{ account: first, chatgptAccountId: "personal-account" },
				{ account: second, chatgptAccountId: "personal-account" },
			]),
		).toEqual([first]);
	});

	it("keeps two seats of one workspace that belong to different people", () => {
		const alice = codexAccount(
			"/home/.codex-alice/auth.json",
			"alice@example.com",
		);
		const bob = codexAccount("/home/.codex-bob/auth.json", "bob@example.com");
		expect(
			dedupeCodexAccounts([
				{ account: alice, chatgptAccountId: "workspace-account" },
				{ account: bob, chatgptAccountId: "workspace-account" },
			]),
		).toEqual([alice, bob]);
	});

	it("keeps every home that has no email, such as API-key homes", () => {
		const first = codexAccount("/home/.codex-api/auth.json", null);
		const second = codexAccount("/home/.codex-api-2/auth.json", null);
		expect(
			dedupeCodexAccounts([
				{ account: first, chatgptAccountId: null },
				{ account: second, chatgptAccountId: null },
			]),
		).toEqual([first, second]);
	});

	it("keeps homes that share an email but state no account id", () => {
		const first = codexAccount("/home/.codex/auth.json", "dev@example.com");
		const second = codexAccount(
			"/home/.codex-work/auth.json",
			"dev@example.com",
		);
		expect(
			dedupeCodexAccounts([
				{ account: first, chatgptAccountId: null },
				{ account: second, chatgptAccountId: null },
			]),
		).toEqual([first, second]);
	});
});

describe("classifyCodexToken", () => {
	const lapsed = accessToken({ exp: NOW / 1000 - HOUR_SECONDS });

	it("reads a lapsed access token as stale while a refresh token remains", () => {
		expect(
			classifyCodexToken({ access_token: lapsed, refresh_token: "rt" }, NOW),
		).toBe("token_stale");
	});

	it("reads a lapsed access token with no refresh token as expired", () => {
		expect(classifyCodexToken({ access_token: lapsed }, NOW)).toBe(
			"token_expired",
		);
		expect(
			classifyCodexToken({ access_token: lapsed, refresh_token: "" }, NOW),
		).toBe("token_expired");
	});

	it("keeps an access token that has not reached its exp live", () => {
		expect(
			classifyCodexToken(
				{
					access_token: accessToken({ exp: NOW / 1000 + HOUR_SECONDS }),
					refresh_token: "rt",
				},
				NOW,
			),
		).toBe("live");
	});

	it("leaves a token without a readable exp to the usage endpoint", () => {
		for (const token of [
			"opaque-token",
			"header.not-json.signature",
			accessToken({ sub: "user" }),
			accessToken({ exp: "soon" }),
		]) {
			expect(classifyCodexToken({ access_token: token }, NOW)).toBe("live");
		}
	});
});

describe("fetchCodexSubscriptionQuota", () => {
	function respondWith(response: Response) {
		return spyOn(globalThis, "fetch").mockResolvedValue(response);
	}

	it("reads a 401 as an expired sign-in", async () => {
		respondWith(new Response(null, { status: 401 }));
		expect((await fetchCodexSubscriptionQuota("token")).status).toBe(
			"token_expired",
		);
	});

	it("reads a 403 as unavailable, not as an expired sign-in", async () => {
		respondWith(new Response(null, { status: 403 }));
		const quota = await fetchCodexSubscriptionQuota("token");
		expect(quota.status).toBe("unavailable");
		expect(quota.statusDetail).toBe("Usage endpoint returned 403.");
	});

	it("reads the quota windows from a 200", async () => {
		respondWith(
			Response.json({
				email: "dev@example.com",
				plan_type: "plus",
				rate_limit: {
					primary_window: {
						used_percent: 12,
						limit_window_seconds: 5 * HOUR_SECONDS,
						reset_at: NOW / 1000 + HOUR_SECONDS,
					},
				},
			}),
		);
		expect(await fetchCodexSubscriptionQuota("token")).toMatchObject({
			status: "ok",
			email: "dev@example.com",
			plan: "plus",
			windows: [{ id: "primary", label: "Session (5h)", usedPercent: 12 }],
		});
	});
});

describe("fetchCodexAccounts", () => {
	it("reports a lapsed token Codex can renew as stale without calling the endpoint", async () => {
		const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 401 }),
		);
		const home = tempHome({
			".codex": {
				"auth.json": JSON.stringify({
					tokens: {
						access_token: accessToken({
							exp: Math.floor(Date.now() / 1000) - HOUR_SECONDS,
						}),
						refresh_token: "rt",
						account_id: "account",
					},
				}),
			},
		});

		const accounts = await fetchCodexAccounts(home);

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			status: "token_stale",
			statusDetail: "Refreshes when Codex next runs.",
			selection: null,
		});
	});

	it("shows a home Paradev created whose login is gone as signed out", async () => {
		const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(null, { status: 500 }),
		);
		const home = tempHome({
			".codex-work": {
				[PROFILE_CREATED_MARKER]: "codex",
				".superset-profile.json": "{}",
			},
		});

		const accounts = await fetchCodexAccounts(home);

		expect(fetchSpy).not.toHaveBeenCalled();
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			agent: "codex",
			credentialKind: "subscription",
			status: "signed_out",
			statusDetail:
				"Signed out — use Switch sign-in to reconnect, or Remove to delete this profile.",
			selection: join(home, ".codex-work"),
		});
	});

	// Its card would offer Remove, which deletes the dir, and Switch sign-in.
	it("gives no card to a provisioned home Paradev did not create once its login is gone", async () => {
		const home = tempHome({
			".codex-work": { ".superset-profile.json": "{}" },
		});

		expect(await fetchCodexAccounts(home)).toEqual([]);
	});
});
