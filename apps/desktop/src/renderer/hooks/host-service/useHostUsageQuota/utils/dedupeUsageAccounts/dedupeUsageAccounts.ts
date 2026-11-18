import type { UsageAccount } from "../../useHostUsageQuota";

export function dedupeUsageAccounts(accounts: UsageAccount[]): UsageAccount[] {
	const unique = new Map<string, UsageAccount>();
	for (const account of accounts) {
		const key = JSON.stringify([
			account.agent,
			account.credentialKind,
			account.credentialKind === "subscription" &&
			account.status !== "signed_out"
				? (account.quotaIdentity ?? account.accountKey)
				: account.accountKey,
		]);
		const previous = unique.get(key);
		if (
			!previous ||
			account.isDefault ||
			(!previous.isDefault &&
				account.status === "ok" &&
				previous.status !== "ok")
		) {
			unique.set(key, account);
		}
	}
	return [...unique.values()];
}
