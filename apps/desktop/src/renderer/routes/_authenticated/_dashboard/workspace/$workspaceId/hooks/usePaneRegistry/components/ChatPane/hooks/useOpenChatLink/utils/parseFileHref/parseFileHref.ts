import {
	type FileLocation,
	splitFileLocation,
} from "renderer/lib/fileLocation";

export type FileHref = FileLocation;

const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const BROWSER_SCHEME = /^(mailto|tel):/i;

export function parseFileHref(href: string): FileHref | null {
	let rest = href.trim();
	const isFileUrl = rest.startsWith("file://");
	if (isFileUrl) {
		try {
			const url = new URL(rest);
			if (url.hostname !== "" && url.hostname !== "localhost") return null;
			rest = url.pathname + url.hash;
		} catch {
			return null;
		}
	} else if (rest === "" || rest.startsWith("#") || BROWSER_SCHEME.test(rest)) {
		return null;
	}

	const location = splitFileLocation(rest);
	if (!isFileUrl && OTHER_SCHEME.test(location.path)) return null;
	const encoded = location.path.replace(/[?#].*$/, "");

	let path: string;
	try {
		path = decodeURIComponent(encoded);
	} catch {
		path = encoded;
	}
	if (path === "") return null;
	return { ...location, path };
}
