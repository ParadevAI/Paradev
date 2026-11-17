const KEY_PREFIX = "v1-migration-complete-";

/**
 * Best-effort kinds (settings/presets/terminals) that were still failing or
 * deferred when the gate completed retry on later boots while this flag is
 * set (they never gate completion, but must not be silently abandoned).
 */
const FOLLOWUP_PREFIX = "v1-migration-followup-pending-";

const ATTENTION_DISMISSED_PREFIX = "v1-migration-attention-dismissed-";

export function isV1MigrationComplete(organizationId: string | null): boolean {
	if (!organizationId) return false;
	try {
		return localStorage.getItem(KEY_PREFIX + organizationId) !== null;
	} catch {
		return false;
	}
}

/**
 * Fired on window when an org's migration first completes mid-session, so
 * UI (V1FlipNotice) can react without polling localStorage.
 */
export const V1_MIGRATION_COMPLETED_EVENT = "v1-migration-completed";

export function markV1MigrationComplete(
	organizationId: string,
	{ armFlipHandoff = true }: { armFlipHandoff?: boolean } = {},
): void {
	const first = !isV1MigrationComplete(organizationId);
	localStorage.setItem(KEY_PREFIX + organizationId, new Date().toISOString());
}

export function isV1FollowUpPending(organizationId: string): boolean {
	try {
		return localStorage.getItem(FOLLOWUP_PREFIX + organizationId) !== null;
	} catch {
		return false;
	}
}

export function setV1FollowUpPending(
	organizationId: string,
	pending: boolean,
): void {
	try {
		const key = FOLLOWUP_PREFIX + organizationId;
		if (pending) localStorage.setItem(key, "1");
		else localStorage.removeItem(key);
	} catch {}
}

export function isV1AttentionDismissed(
	organizationId: string,
	signature: string,
): boolean {
	try {
		return (
			localStorage.getItem(ATTENTION_DISMISSED_PREFIX + organizationId) ===
			signature
		);
	} catch {
		return false;
	}
}

export function dismissV1Attention(
	organizationId: string,
	signature: string,
): void {
	try {
		localStorage.setItem(
			ATTENTION_DISMISSED_PREFIX + organizationId,
			signature,
		);
	} catch {}
}
