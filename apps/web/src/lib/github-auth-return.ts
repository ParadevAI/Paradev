const KEY = "superset-github-auth-return";
const MAX_AGE = 10 * 60 * 1000;

export function markGithubAuthReturn(): void {
	try {
		sessionStorage.setItem(KEY, String(Date.now()));
	} catch {}
}
export function clearGithubAuthReturn(): void {
	try {
		sessionStorage.removeItem(KEY);
	} catch {}
}
export function consumeGithubAuthReturn(now = Date.now()): boolean {
	try {
		const value = sessionStorage.getItem(KEY);
		sessionStorage.removeItem(KEY);
		const started = value === null ? NaN : Number(value);
		return (
			Number.isFinite(started) && started <= now && now - started <= MAX_AGE
		);
	} catch {
		return false;
	}
}
