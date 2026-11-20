import { expect, test } from "bun:test";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "renderer/hooks/host-service/useHostUsageQuota";
import { getCodexPresetQuota } from "./getCodexPresetQuota";

const now = Date.UTC(2026, 10, 20);
const session: UsageQuotaWindow = {
	id: "primary",
	label: "Session (5h)",
	usedPercent: 80,
	resetsAt: new Date(now + 3600_000),
};
const weekly: UsageQuotaWindow = {
	id: "secondary",
	label: "Weekly",
	usedPercent: 50,
	resetsAt: new Date(now + 2 * 3600_000),
};
const account: UsageAccount = {
	agent: "codex",
	credentialKind: "subscription",
	selection: null,
	accountKey: "default",
	email: null,
	plan: "plus",
	status: "ok",
	statusDetail: null,
	sourceLabel: "default",
	windows: [session, weekly],
	isDefault: true,
	creditsBalance: null,
	extraUsage: null,
	fetchedAt: new Date(now),
};

test("summarizes the default Codex subscription's weekly window", () => {
	const result = getCodexPresetQuota(
		[
			{ ...account, agent: "claude" },
			{ ...account, isDefault: false, accountKey: "other" },
			account,
		],
		now,
		false,
	);
	expect(result.account).toBe(account);
	expect(result.summary).toBe(weekly);
	expect(result.windows).toEqual([session, weekly]);
});

test("keeps a current window when another window has reset", () => {
	const expired = { ...weekly, resetsAt: new Date(now) };
	const result = getCodexPresetQuota(
		[{ ...account, windows: [session, expired] }],
		now,
		false,
	);
	expect(result.summary).toBe(session);
	expect(result.windows).toEqual([session]);
});

test("does not substitute another subscription for the default API account", () => {
	const result = getCodexPresetQuota(
		[
			{ ...account, isDefault: false },
			{ ...account, credentialKind: "api_key" },
		],
		now,
		false,
	);
	expect(result.account?.credentialKind).toBe("api_key");
	expect(result.summary).toBeUndefined();
});

test("hides cached quota after it expires or the query fails", () => {
	expect(getCodexPresetQuota([account], now + 600_000, false).windows).toEqual(
		[],
	);
	expect(getCodexPresetQuota([account], now, true).windows).toEqual([]);
});
