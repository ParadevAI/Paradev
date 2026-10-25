import { verifiedClaudeQuotaOwner } from "./quota-identity";
import { opaqueQuotaIdentity } from "./quota-widget-metadata";
import type { UsageAccount } from "./types";

/** Display scope is established by the authenticated owner, independently of quota availability. */
export function projectWidgetQuotaMetadata(account: UsageAccount, now = Date.now()): UsageAccount {
 const {quotaIdentity: previous, ...clean} = account;
 const owner = account.agent === "claude" && account.credentialKind === "subscription" && !["token_expired", "signed_out"].includes(account.status) ? verifiedClaudeQuotaOwner(account, now) : null;
 const identity = account.agent === "claude" ? owner ? opaqueQuotaIdentity("claude", account.accountKey, owner.identity) : undefined : previous;
 return {...clean, ...(identity ? {quotaIdentity: identity} : {}), ...(!account.discoveryFailed ? {sourceId: opaqueQuotaIdentity(account.agent, account.accountKey, "source")} : {})};
}
