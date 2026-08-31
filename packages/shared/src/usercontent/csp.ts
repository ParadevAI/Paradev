/**
 * The one policy every viewer loads a page under. Network is closed
 * (`default-src 'none'`, no `connect-src`): a page is a document that
 * computes, and origin isolation — not this header — is what keeps a page's
 * script from reaching anything of ours. `script-src 'self'` admits the
 * runtime the origin injects; `'unsafe-inline'` is what agent-authored
 * single-file pages are made of.
 */
export function pageContentSecurityPolicy(
	frameAncestors: readonly string[],
): string {
	return [
		"default-src 'none'",
		"script-src 'self' 'unsafe-inline'",
		"style-src 'unsafe-inline'",
		"img-src data: blob: https:",
		"media-src data: blob: https:",
		"font-src data: https:",
		"worker-src blob:",
		"form-action 'none'",
		"base-uri 'none'",
		`frame-ancestors ${frameAncestors.join(" ")}`,
	].join("; ");
}
