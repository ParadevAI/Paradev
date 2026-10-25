import { expect, test } from "bun:test";
import type { UsageAccount } from "./types";
import { createWidgetQuotaReader } from "./widget-quota-reader";

function quota(owner: string): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "same-source",
		sourceLabel: owner,
		email: `${owner}@example.test`,
		plan: "max",
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: true,
		fetchedAt: new Date(0),
		quotaIdentity: owner,
		resetCredits: {
			availableCount: owner === "A" ? 3 : 1,
			expirations: null,
			checkedAt: new Date(0),
		},
	};
}

test("a source revision changes labels, identity and reset credits without waiting for quota TTL", async () => {
	let owner = "A";
	let loads = 0;
	const reader = createWidgetQuotaReader(
		[
			{
				agent: "claude",
				capture: async () => {
					const captured = owner;
					return {
						revision: captured,
						load: async () => {
							loads++;
							return [quota(captured)];
						},
					};
				},
			},
		],
		() => 0,
	);
	expect((await reader.get())[0]?.resetCredits?.availableCount).toBe(3);
	expect((await reader.get())[0]?.email).toBe("A@example.test");
	expect(loads).toBe(1);
	owner = "B";
	const [changed] = await reader.get();
	expect(changed?.email).toBe("B@example.test");
	expect(changed?.sourceLabel).toBe("B");
	expect(changed?.quotaIdentity).toBe("B");
	expect(changed?.resetCredits?.availableCount).toBe(1);
	expect(loads).toBe(2);
});

test("one unverifiable provider cannot erase another provider's working quota", async () => {
	const reader = createWidgetQuotaReader(
		[
			{
				agent: "claude",
				capture: async () => {
					throw new Error("synthetic-private-error");
				},
			},
			{
				agent: "codex",
				capture: async () => ({
					revision: "C",
					load: async () => [{ ...quota("C"), agent: "codex" }],
				}),
			},
		],
		() => 0,
	);
	const values = await reader.get();
	expect(values.find((value) => value.agent === "claude")?.status).toBe(
		"unavailable",
	);
	const failed = values.find((value) => value.agent === "claude");
	expect(failed?.discoveryFailed).toBe(true);
	expect(failed?.quotaIdentity).toBeUndefined();
	expect(failed?.sourceId).toBeUndefined();
	expect(values.find((value) => value.agent === "codex")?.status).toBe("ok");
	expect(JSON.stringify(values)).not.toContain("synthetic-private-error");
});
