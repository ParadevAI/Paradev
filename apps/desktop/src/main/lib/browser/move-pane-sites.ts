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

async function paneCookies(from: CookieStore): Promise<Electron.Cookie[]> {
	return (await from.get({})).filter(
		(cookie) => !isOwnHost((cookie.domain ?? "").replace(/^\./, "")),
	);
}

/**
 * The browser pane moved from the app's session to its own. Copies the pane's
 * cookies across once, so users stay signed in to sites. The copy runs once, so
 * a cookie the user clears in the pane does not come back. Paradev's own
 * cookies stay in the app session, away from pane extensions.
 */
export async function movePaneSitesOnce({
	from,
	to,
	markerPath,
}: {
	from: CookieStore;
	to: CookieStore;
	markerPath: string;
}): Promise<number> {
	if (existsSync(markerPath) || existsSync(clearedMarkerPath(markerPath))) {
		return 0;
	}
	const cookies = await paneCookies(from);
	const copied = await copyCookies(cookies, to);
	writeFileSync(markerPath, `${copied}/${cookies.length}\n`);
	return copied;
}

/**
 * After a full copy, clears the moved sites from the app session so "Clear
 * browsing data" reaches all of it again. On a large app session this can take
 * minutes, so startup must not wait on it. A clean-up that did not finish runs
 * again on the next start; it never touches the pane session.
 */
export async function clearMovedPaneSitesOnce({
	from,
	markerPath,
	readVisitedUrls,
	clearOldSites,
}: {
	from: CookieStore;
	markerPath: string;
	readVisitedUrls: () => string[];
	clearOldSites: (origins: string[]) => Promise<void>;
}): Promise<void> {
	const clearedPath = clearedMarkerPath(markerPath);
	if (existsSync(clearedPath) || !existsSync(markerPath)) return;
	const [done, total] = readFileSync(markerPath, "utf8").trim().split("/");
	if (done !== total) return;

	const origins = paneSiteOrigins(await paneCookies(from), readVisitedUrls());
	if (origins.length > 0) await clearOldSites(origins);
	writeFileSync(clearedPath, "");
}

function clearedMarkerPath(markerPath: string): string {
	return `${markerPath}.cleared`;
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
