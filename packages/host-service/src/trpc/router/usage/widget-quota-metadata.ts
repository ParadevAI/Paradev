import { verifiedClaudeQuotaOwner } from "./quota-identity";
import { opaqueQuotaIdentity } from "./quota-widget-metadata";
import type { UsageAccount } from "./types";

/** Display scope follows the profile slot and authenticated owner, not credential transport. */
export function projectWidgetQuotaMetadata(
	account: UsageAccount,
	now = Date.now(),
): UsageAccount {
	const { quotaIdentity: previous, sourceId: _sourceId, ...clean } = account;
	const slot =
		account.agent === "claude"
			? JSON.stringify(
					account.selection === null
						? ["system-default"]
						: ["profile", account.selection],
				)
			: account.accountKey;
	const owner =
		account.agent === "claude" &&
		account.credentialKind === "subscription" &&
		!["token_expired", "signed_out"].includes(account.status)
			? verifiedClaudeQuotaOwner(account, now)
			: null;
	const identity =
		account.agent === "claude"
			? owner
				? opaqueQuotaIdentity("claude", slot, owner.identity)
				: undefined
			: previous;
	return {
		...clean,
		...(identity ? { quotaIdentity: identity } : {}),
		...(!account.discoveryFailed
			? { sourceId: opaqueQuotaIdentity(account.agent, slot, "source") }
			: {}),
	};
}
