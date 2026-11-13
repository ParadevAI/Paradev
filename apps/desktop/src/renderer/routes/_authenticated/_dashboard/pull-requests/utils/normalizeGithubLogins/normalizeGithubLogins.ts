const GITHUB_LOGIN_PATTERN =
	/^(?!.*--)[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?(?:\[bot\])?$/i;

export function normalizeGithubLogin(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const login = value.trim().replace(/^@/, "");
	return GITHUB_LOGIN_PATTERN.test(login) ? login : null;
}

/** Comma-separated logins keep saved filters and existing author URLs compatible.
 * Bound these singleton preferences to 20 logins; GitHub logins are length-limited.
 */
export function normalizeGithubLogins(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const logins = new Map<string, string>();
	for (const entry of value.split(",")) {
		const login = normalizeGithubLogin(entry);
		if (!login) return null;
		const key = login.toLowerCase();
		if (!logins.has(key)) logins.set(key, login);
	}
	return [...logins.values()].slice(0, 20).join(",") || null;
}
