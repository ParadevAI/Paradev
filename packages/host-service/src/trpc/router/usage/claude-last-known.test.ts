import { expect, test } from "bun:test";
import {
	chmod,
	link,
	mkdtemp,
	readFile,
	rm,
	stat,
	symlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClaudeLastKnownStore } from "./claude-last-known";
import type { UsageQuotaWindow } from "./types";

const profile = {
	account: { uuid: "11111111-1111-4111-8111-111111111111" },
	organization: { uuid: "22222222-2222-4222-8222-222222222222" },
};
const at = Date.parse("2026-10-25T20:00:00Z");
const windows = (): Array<
	UsageQuotaWindow & { source: "provider"; observedAt: Date }
> => [
	{
		id: "five_hour",
		label: "Session (5h)",
		usedPercent: 24,
		resetsAt: new Date(at + 3600_000),
		observedAt: new Date(at - 1000),
		source: "provider",
	},
	{
		id: "seven_day",
		label: "Weekly",
		usedPercent: 52,
		resetsAt: null,
		observedAt: new Date(at),
		source: "provider",
	},
];

test("restart retains only exact-token authenticated owner history with original per-window dates", async () => {
	const root = await mkdtemp(join(tmpdir(), "claude-history-"));
	try {
		const path = join(root, "history.json");
		const store = createClaudeLastKnownStore(path, () => at);
		await store.remember("private-fixture-token", profile, {
			fetchedAt: new Date(at),
			windows: windows(),
		});
		const content = await readFile(path, "utf8");
		expect(content).not.toContain("private-fixture-token");
		expect(content).not.toContain(profile.account.uuid);
		expect(content).not.toContain(profile.organization.uuid);
		expect((await stat(path)).mode & 0o777).toBe(0o600);
		const restarted = createClaudeLastKnownStore(path, () => at + 600_000);
		expect(await restarted.get("private-fixture-token", profile)).toEqual({
			fetchedAt: new Date(at),
			windows: windows(),
		});
		expect(await restarted.get("rotated-token", profile)).toBeUndefined();
		expect(
			await restarted.get("private-fixture-token", {
				account: profile.account,
				organization: { uuid: "33333333-3333-4333-8333-333333333333" },
			}),
		).toBeUndefined();
		expect(
			await restarted.get("private-fixture-token", {
				email: "display-only@example.test",
			}),
		).toBeUndefined();
		await restarted.forget("private-fixture-token", profile);
		expect(
			await createClaudeLastKnownStore(path, () => at + 600_000).get(
				"private-fixture-token",
				profile,
			),
		).toBeUndefined();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("native observations cannot promote old provider history or add wallet/reset fields", async () => {
	const store = createClaudeLastKnownStore(undefined, () => at + 5000);
	await store.remember("fixture-token", profile, {
		fetchedAt: new Date(at + 5000),
		windows: [
			...windows(),
			{
				id: "native",
				label: "native",
				usedPercent: 2,
				resetsAt: null,
				source: "claude_sdk",
				observedAt: new Date(at + 5000),
			},
		],
	});
	const result = await store.get("fixture-token", profile);
	expect(result?.fetchedAt).toEqual(new Date(at));
	expect(result?.windows).toEqual(windows());
	expect(Object.keys(result ?? {}).sort()).toEqual(["fetchedAt", "windows"]);
});

test("future, expired and unverified history stays absent", async () => {
	const store = createClaudeLastKnownStore(undefined, () => at);
	await store.remember(
		"fixture-token",
		{},
		{ fetchedAt: new Date(at), windows: windows() },
	);
	expect(await store.get("fixture-token", profile)).toBeUndefined();
	await store.remember("future", profile, {
		fetchedAt: new Date(at + 1),
		windows: windows().map((w) => ({ ...w, observedAt: new Date(at + 1) })),
	});
	expect(await store.get("future", profile)).toBeUndefined();
	await store.remember("expired", profile, {
		fetchedAt: new Date(at - 15 * 86400_000),
		windows: windows().map((w) => ({
			...w,
			observedAt: new Date(at - 15 * 86400_000),
		})),
	});
	expect(await store.get("expired", profile)).toBeUndefined();
});

test("unsafe history aliases and public-mode files cannot provide display authority", async () => {
	const root = await mkdtemp(join(tmpdir(), "claude-history-safety-"));
	try {
		const path = join(root, "history.json");
		await createClaudeLastKnownStore(path, () => at).remember(
			"fixture-token",
			profile,
			{ fetchedAt: new Date(at), windows: windows() },
		);
		const alias = join(root, "alias.json");
		await symlink(path, alias);
		expect(
			await createClaudeLastKnownStore(alias, () => at).get(
				"fixture-token",
				profile,
			),
		).toBeUndefined();
		await rm(alias);
		await link(path, alias);
		expect(
			await createClaudeLastKnownStore(path, () => at).get(
				"fixture-token",
				profile,
			),
		).toBeUndefined();
		await rm(alias);
		await chmod(path, 0o644);
		expect(
			await createClaudeLastKnownStore(path, () => at).get(
				"fixture-token",
				profile,
			),
		).toBeUndefined();
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
