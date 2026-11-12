const KEY = "superset-github-auth-return";
const PARAM = "_github_auth_return";
const MAX_AGE = 10 * 60 * 1000;

export function markGithubAuthReturn(callbackURL: string): string {
	try {
		const target = new URL(callbackURL, location.href);
		if (target.origin !== location.origin) return callbackURL;
		target.searchParams.set(PARAM, crypto.randomUUID());
		sessionStorage.setItem(
			KEY,
			JSON.stringify({ url: target.href, started: Date.now() }),
		);
		return target.href;
	} catch {
		return callbackURL;
	}
}
export function clearGithubAuthReturn(): void {
	try {
		sessionStorage.removeItem(KEY);
	} catch {}
}
export function consumeGithubAuthReturn(
	href = location.href,
	now = Date.now(),
): string | undefined {
	try {
		const value = sessionStorage.getItem(KEY);
		if (!value) return;
		const saved = JSON.parse(value) as { url: string; started: number };
		const expected = new URL(saved.url);
		const current = new URL(href);
		const valid =
			Number.isFinite(saved.started) &&
			saved.started <= now &&
			now - saved.started <= MAX_AGE;
		if (!valid) clearGithubAuthReturn();
		if (
			!valid ||
			!expected.searchParams.get(PARAM) ||
			expected.origin !== current.origin ||
			expected.pathname !== current.pathname ||
			expected.searchParams.get(PARAM) !== current.searchParams.get(PARAM)
		)
			return;
		clearGithubAuthReturn();
		return current.href;
	} catch {
		clearGithubAuthReturn();
		return;
	}
}
export function cleanGithubAuthReturnUrl(value: string): string {
	try {
		const url = new URL(value);
		url.searchParams.delete(PARAM);
		return url.href;
	} catch {
		return value;
	}
}
