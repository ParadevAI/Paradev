const OPAQUE_IDENTITY = /^[a-f0-9]{64}$/;
const ACCOUNT_ID = /^(?:claude|codex|grok|agy|opencode):[a-f0-9]{64}$/;

export function hasVerifiedWidgetIdentity(account: {
	id: string;
	quotaIdentity?: string;
	status: string;
	identityChanged?: boolean;
	historical?: boolean;
}): boolean {
	return (
		account.status === "ok" &&
		!account.identityChanged &&
		!account.historical &&
		typeof account.quotaIdentity === "string" &&
		OPAQUE_IDENTITY.test(account.quotaIdentity) &&
		ACCOUNT_ID.test(account.id) &&
		account.id.endsWith(`:${account.quotaIdentity}`)
	);
}
