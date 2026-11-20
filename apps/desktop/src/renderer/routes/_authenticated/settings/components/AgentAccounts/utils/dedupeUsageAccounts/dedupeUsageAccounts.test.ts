import { expect, test } from "bun:test";
import type { UsageAccount } from "renderer/hooks/host-service/useHostUsageQuota";
import { dedupeUsageAccounts } from "./dedupeUsageAccounts";

function account(
	accountKey: string,
	overrides: Partial<UsageAccount> = {},
): UsageAccount {
	return {
		agent: "claude",
		credentialKind: "subscription",
		accountKey,
		quotaIdentity: "user-org",
		sourceLabel: accountKey,
		email: "same@example.com",
		plan: null,
		status: "ok",
		statusDetail: null,
		windows: [],
		creditsBalance: null,
		extraUsage: null,
		selection: accountKey,
		isDefault: false,
		fetchedAt: new Date(0),
		...overrides,
	};
}
test("repeated sign-ins count once and preserve the selected default", () => {
	const first = account("first");
	const selected = account("selected", { isDefault: true });
	expect(dedupeUsageAccounts([first, selected, account("third")])).toEqual([
		selected,
	]);
	expect(dedupeUsageAccounts([selected, first])).toEqual([selected]);
});
test("prefer readable quota without replacing the selected default", () => {
	const expired = account("expired", { status: "token_expired" });
	const live = account("live");
	expect(dedupeUsageAccounts([expired, live])).toEqual([live]);
	const selected = { ...expired, isDefault: true };
	expect(dedupeUsageAccounts([selected, live])).toEqual([selected]);
});
test("keep separate organizations, unknown identities, API profiles and signed-out profiles", () => {
	const accounts = [
		account("a"),
		account("b", { quotaIdentity: "user-other-org" }),
		account("c", { quotaIdentity: undefined }),
		account("d", { quotaIdentity: undefined }),
		account("api", { credentialKind: "api_key" }),
		account("signed-out", { status: "signed_out" }),
		account("codex", { agent: "codex" }),
	];
	expect(dedupeUsageAccounts(accounts)).toEqual(accounts);
});

test("readable quota wins when both duplicates are default", () => {
	const live = account("live", { isDefault: true });
	const expired = account("expired", {
		isDefault: true,
		status: "token_expired",
	});
	expect(dedupeUsageAccounts([live, expired])).toEqual([live]);
	expect(dedupeUsageAccounts([expired, live])).toEqual([live]);
});
