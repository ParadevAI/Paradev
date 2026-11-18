import { describe, expect, it } from "bun:test";
import type {
	UsageAccount,
	UsageQuotaWindow,
} from "renderer/hooks/host-service/useHostUsageQuota";
import { selectRailUsage } from "./selectRailUsage";

function quotaWindow(id: string, usedPercent: number): UsageQuotaWindow {
	return { id, label: id, usedPercent, resetsAt: null };
}

function account(overrides: Partial<UsageAccount>): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey: "default",
		sourceLabel: "~/.claude",
		email: null,
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [quotaWindow("five_hour", 10), quotaWindow("seven_day", 40)],
		creditsBalance: null,
		extraUsage: null,
		selection: null,
		isDefault: true,
		fetchedAt: new Date(0),
		...overrides,
	};
}

describe("selectRailUsage", () => {
	it("picks the default readable subscription login per provider", () => {
		const entries = selectRailUsage([
			account({ accountKey: "other", isDefault: false }),
			account({ accountKey: "main" }),
			account({ agent: "codex", accountKey: "api", credentialKind: "api_key" }),
			account({
				agent: "codex",
				accountKey: "expired",
				status: "token_expired",
			}),
		]);
		expect(entries.map((entry) => entry.account.accountKey)).toEqual(["main"]);
	});

	it("drops model-scoped windows and keeps the two tightest of the rest", () => {
		const [claude, agy] = selectRailUsage([
			account({
				windows: [
					quotaWindow("five_hour", 10),
					quotaWindow("seven_day", 40),
					quotaWindow("weekly_scoped:sonnet", 99),
				],
			}),
			account({
				agent: "agy",
				windows: [
					quotaWindow("gemini-5h", 5),
					quotaWindow("gemini-weekly", 60),
					quotaWindow("3p-5h", 80),
					quotaWindow("3p-weekly", 20),
				],
			}),
		]);
		expect(claude?.rings.map((ring) => ring.id)).toEqual([
			"five_hour",
			"seven_day",
		]);
		expect(agy?.rings.map((ring) => ring.id)).toEqual([
			"3p-5h",
			"gemini-weekly",
		]);
	});

	it("caps the rail at two providers in a fixed order", () => {
		const entries = selectRailUsage([
			account({ agent: "grok", windows: [quotaWindow("weekly", 5)] }),
			account({ agent: "codex", windows: [quotaWindow("primary", 5)] }),
			account({}),
		]);
		expect(entries.map((entry) => entry.account.agent)).toEqual([
			"claude",
			"codex",
		]);
	});
});
