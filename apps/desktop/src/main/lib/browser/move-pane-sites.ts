import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isOwnHost } from "@superset/shared/own-domains";

interface CookieStore {
	get(filter: Electron.CookiesGetFilter): Promise<Electron.Cookie[]>;
	set(details: Electron.CookiesSetDetails): Promise<void>;
}

function toSetDetails(cookie: Electron.Cookie): Electron.CookiesSetDetails {
	const host = (cookie.domain ?? "").replace(/^\./, "");
	const path = cookie.path ?? "/";
	return {
		url: `${cookie.secure ? "https" : "http"}://${host}${path}`,
		name: cookie.name,
		value: cookie.value,
		// A host-only cookie given a domain would widen to every subdomain.
		domain: cookie.hostOnly ? undefined : cookie.domain,
		path,
		secure: cookie.secure,
		httpOnly: cookie.httpOnly,
		expirationDate: cookie.expirationDate,
		sameSite: cookie.sameSite,
	};
}

function paneSiteOrigins(
	cookies: Electron.Cookie[],
	visitedUrls: string[],
): string[] {
	const origins = new Set<string>();
	for (const cookie of cookies) {
		const host = (cookie.domain ?? "").replace(/^\./, "");
		if (host) origins.add(`https://${host}`);
	}
	for (const url of visitedUrls) {
		if (!URL.canParse(url)) continue;
		const { protocol, origin } = new URL(url);
		if (protocol === "http:" || protocol === "https:") origins.add(origin);
	}
	return [...origins].filter((origin) => !isOwnHost(new URL(origin).hostname));
}

/**
 * The browser pane moved from the app's session to its own. Copies the pane's
 * cookies across once, so users stay signed in to sites, then clears those
 * sites from the app session so "Clear browsing data" reaches all of it again.
 * The copy runs once, so a cookie the user clears in the pane does not come
 * back; a clean-up that failed runs again on the next start. Paradev's own
 * cookies stay in the app session, away from pane extensions.
 */
export async function movePaneSitesOnce({
	from,
	to,
	markerPath,
	readVisitedUrls,
	clearOldSites,
}: {
	from: CookieStore;
	to: CookieStore;
	markerPath: string;
	readVisitedUrls: () => string[];
	clearOldSites: (origins: string[]) => Promise<void>;
}): Promise<number> {
	const clearedPath = `${markerPath}.cleared`;
	if (existsSync(clearedPath)) return 0;

	const cookies = (await from.get({})).filter(
		(cookie) => !isOwnHost((cookie.domain ?? "").replace(/^\./, "")),
	);
	let copied = 0;
	if (existsSync(markerPath)) {
		const [done, total] = readFileSync(markerPath, "utf8").trim().split("/");
		if (done !== total) return 0;
	} else {
		copied = await copyCookies(cookies, to);
		writeFileSync(markerPath, `${copied}/${cookies.length}\n`);
		if (copied < cookies.length) return copied;
	}

	const origins = paneSiteOrigins(cookies, readVisitedUrls());
	if (origins.length > 0) await clearOldSites(origins);
	writeFileSync(clearedPath, "");
	return copied;
}

async function copyCookies(
	cookies: Electron.Cookie[],
	to: CookieStore,
): Promise<number> {
	let copied = 0;
	for (const cookie of cookies) {
		try {
			await to.set(toSetDetails(cookie));
			copied++;
		} catch (error) {
			console.warn(
				`[browser] Could not copy cookie ${cookie.name} for ${cookie.domain}:`,
				error,
			);
		}
	}
	return copied;
}
