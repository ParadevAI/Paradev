import { expect, test } from "bun:test";
import {
	chmod,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClaudeRequestClient } from "./claude-request";
import { readQuotaRetryHint, recordQuotaRetry } from "./quota-backoff";
import {
	createQuotaCooldownStore,
	hashQuotaScope,
} from "./quota-cooldown-store";

test("endpoint pauses survive restart and token rotation without cached replay extending a deadline", async () => {
	const root = await mkdtemp(join(tmpdir(), "claude-cooldown-"));
	try {
		const file = join(root, "cooldowns.json");
		let at = 1000,
			calls = 0;
		const fetcher = async () => {
			calls++;
			return new Response(null, {
				status: 429,
				headers: { "Retry-After": "600" },
			});
		};
		const first = createClaudeRequestClient({
			store: createQuotaCooldownStore(file, () => at),
			now: () => at,
			random: () => 0,
			fetcher,
		});
		const response = await first.request(
			"usage",
			"fixture-token-private",
			"https://example.test/usage",
			{},
			"/fixture/profile",
		);
		expect(readQuotaRetryHint(recordQuotaRetry({}, response))?.retryAt).toBe(
			601000,
		);
		at = 600999;
		const restarted = createClaudeRequestClient({
			store: createQuotaCooldownStore(file, () => at),
			now: () => at,
			random: () => 0,
			fetcher,
		});
		const replay = await restarted.request(
			"usage",
			"new-unknown-owner-token",
			"https://example.test/usage",
			{},
			"/fixture/profile",
		);
		expect(readQuotaRetryHint(recordQuotaRetry({}, replay))?.retryAt).toBe(
			601000,
		);
		expect(calls).toBe(1);
		expect((await stat(file)).mode & 0o777).toBe(0o600);
		const content = await readFile(file, "utf8");
		expect(content).not.toContain("fixture-token-private");
		expect(content).not.toContain("/fixture/profile");
		at++;
		await restarted.request(
			"usage",
			"new-unknown-owner-token",
			"https://example.test/usage",
			{},
			"/fixture/profile",
		);
		expect(calls).toBe(2);
		const states = JSON.parse(await readFile(file, "utf8")).entries;
		expect(
			states.find(
				(value: { key: string }) =>
					value.key ===
					hashQuotaScope([
						"claude-profile-pause-v1",
						"usage",
						"/fixture/profile",
					]),
			),
		).toMatchObject({ failures: 2, retryAt: 1201000 });
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("profile and wallet pauses are independent, diagnostics bounded, and auth rejection never renews", async () => {
	let at = 0,
		calls = 0;
	const client = createClaudeRequestClient({
		store: createQuotaCooldownStore(undefined, () => at),
		now: () => at,
		random: () => 0,
		fetcher: (async (_url, init) => {
			calls++;
			return new Response(null, {
				status:
					new Headers(init?.headers).get("test-status") === "401" ? 401 : 503,
			});
		}) as typeof fetch,
	});
	await client.request("profile", "a", "https://example.test", {});
	await client.request("profile", "a", "https://example.test", {});
	await client.request("wallet", "a", "https://example.test", {});
	expect(calls).toBe(2);
	for (let i = 0; i < 110; i++) {
		at++;
		await client.request("usage", "auth-fixture", "https://example.test", {
			headers: { "test-status": "401" },
		});
	}
	expect(client.diagnostics()).toHaveLength(96);
	expect(
		client
			.diagnostics()
			.every(
				(value) =>
					value.status === 401 &&
					value.retryAt === 0 &&
					/^[a-f0-9]{64}$/.test(value.scope),
			),
	).toBe(true);
});

test("cooldown reader rejects aliased and publicly readable metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "cooldown-private-"));
	try {
		const file = join(root, "state.json"),
			other = join(root, "other.json"),
			key = hashQuotaScope("fixture");
		const value = {
			key,
			kind: "rate_limit" as const,
			status: 429,
			failures: 1,
			retryAt: 600000,
			updatedAt: 0,
		};
		createQuotaCooldownStore(file, () => 0).set(value);
		await chmod(file, 0o644);
		expect(createQuotaCooldownStore(file, () => 0).get(key)).toBeUndefined();
		await rm(file);
		await writeFile(other, JSON.stringify({ version: 1, entries: [value] }), {
			mode: 0o600,
		});
		await symlink(other, file);
		expect(createQuotaCooldownStore(file, () => 0).get(key)).toBeUndefined();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
