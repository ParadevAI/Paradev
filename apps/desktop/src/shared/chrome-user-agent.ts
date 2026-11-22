/**
 * Chrome's reduced user agent for the browser pane. Electron's default names
 * the app and "Electron/x", which sites and extensions read as a desktop app:
 * LastPass then takes its desktop path, reads `document.cookie` in its service
 * worker and never loads the vault.
 */
export function chromeUserAgent(electronUserAgent: string): string {
	const platform =
		/^Mozilla\/5\.0 \(([^)]*)\)/.exec(electronUserAgent)?.[1] ??
		"Macintosh; Intel Mac OS X 10_15_7";
	const major = /Chrome\/(\d+)/.exec(electronUserAgent)?.[1] ?? "152";
	return `Mozilla/5.0 (${platform}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}

export const GOOGLE_SIGN_IN_HOST = "accounts.google.com";

/**
 * Google refuses sign-in from browsers embedded in apps, and reads the pane's
 * missing "Google Chrome" brand as one. Firefox sends no brands, so on
 * Google's sign-in host only, the pane names itself as Firefox.
 */
export function firefoxUserAgent(electronUserAgent: string): string {
	// ponytail: Firefox ships about two majors ahead of Chrome; fix the offset if Google starts refusing it.
	const chromeMajor = Number(/Chrome\/(\d+)/.exec(electronUserAgent)?.[1]);
	const major = Number.isFinite(chromeMajor) ? chromeMajor + 2 : 154;
	const platform = (
		/^Mozilla\/5\.0 \(([^)]*)\)/.exec(electronUserAgent)?.[1] ??
		"Macintosh; Intel Mac OS X 10_15_7"
	).replace(/Mac OS X (\d+)_(\d+)(?:_\d+)?/, "Mac OS X $1.$2");
	return `Mozilla/5.0 (${platform}; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
}
