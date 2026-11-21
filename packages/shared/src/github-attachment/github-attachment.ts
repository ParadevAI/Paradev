const ATTACHMENT_URL_PATTERN =
	/^https:\/\/github\.com\/user-attachments\/assets\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOOKUP_TIMEOUT_MS = 10_000;

export function isGithubAttachmentUrl(url: string): boolean {
	return ATTACHMENT_URL_PATTERN.test(url);
}

/**
 * On a private repository GitHub serves an attachment only to a signed-in
 * browser session, and answers anything else with 404. With the viewer's
 * token it redirects to a signed copy that loads anywhere for five minutes.
 * Null when the token can't see it.
 */
export async function signedGithubAttachmentUrl(
	url: string,
	token: string,
	{
		fetch: fetchImpl = fetch,
		timeoutMs = LOOKUP_TIMEOUT_MS,
	}: { fetch?: typeof fetch; timeoutMs?: number } = {},
): Promise<string | null> {
	if (!isGithubAttachmentUrl(url)) return null;
	const response = await fetchImpl(url, {
		method: "HEAD",
		redirect: "manual",
		headers: { Authorization: `Bearer ${token}` },
		signal: AbortSignal.timeout(timeoutMs),
	});
	const location = response.headers.get("location");
	if (response.status < 300 || response.status >= 400 || !location) return null;
	return location.startsWith("https://") ? location : null;
}
