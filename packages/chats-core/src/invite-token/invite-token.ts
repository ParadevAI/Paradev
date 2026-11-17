/**
 * The token from an invite link (`…/invites/<token>`, pasted or opened as `dev://invites/<token>`), or the token
 * itself if that's what was pasted. A query or fragment after it (a messenger's tracking, say) is ignored, and so is a
 * link still being typed (tokens are long), so it isn't looked up half-written.
 */
export function inviteTokenFrom(text: string): string | null {
	const trimmed = text.trim();
	const match = trimmed
		.split(/[?#]/)[0]!
		.match(/\/invites\/([A-Za-z0-9_-]{20,})\/?$/);
	if (match) return match[1]!;
	return /^[A-Za-z0-9_-]{20,}$/.test(trimmed) ? trimmed : null;
}
