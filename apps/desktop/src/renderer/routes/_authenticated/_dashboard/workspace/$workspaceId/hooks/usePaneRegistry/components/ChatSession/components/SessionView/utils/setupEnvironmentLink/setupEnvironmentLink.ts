const SETUP_SKILL = "superset:environment";
const URL_PATTERN = /https?:\/\/[^\s)>\]]+/g;
const ENVIRONMENT_PATH = /^\/environments\/([^/]+)\/?$/;

/**
 * The environment a setup session works on: the one its first message links
 * when that message runs the setup skill, which is how Get started opens the
 * session.
 */
export function setupEnvironmentId(
	firstUserMessage: string | null,
	webUrl: string,
): string | null {
	if (!firstUserMessage?.includes(SETUP_SKILL)) return null;
	const origin = new URL(webUrl).origin;
	for (const [href] of firstUserMessage.matchAll(URL_PATTERN)) {
		const url = URL.canParse(href) ? new URL(href) : null;
		const match =
			url?.origin === origin ? ENVIRONMENT_PATH.exec(url.pathname) : null;
		if (match?.[1]) return decodeURIComponent(match[1]);
	}
	return null;
}
