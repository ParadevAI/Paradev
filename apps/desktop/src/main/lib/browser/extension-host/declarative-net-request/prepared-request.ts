import { getDomain } from "tldts";
import { type DnrRequest, RESOURCE_TYPES } from "./types";
import { urlTokens } from "./url-filter";

const KNOWN_METHODS = new Set([
	"connect",
	"delete",
	"get",
	"head",
	"options",
	"patch",
	"post",
	"put",
]);

/** A request parsed once, then shared by every extension's rules. */
export interface PreparedRequest {
	request: DnrRequest;
	url: URL;
	hostSuffixes: string[];
	tokens: Set<string>;
	initiatorSuffixes: string[];
	resourceBit: number;
	method: string;
	thirdParty: boolean;
}

/** `a.b.c` → `a.b.c`, `b.c`, `c`. An IP address is only itself. */
export function domainSuffixes(host: string): string[] {
	const suffixes = [host];
	if (host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) return suffixes;
	let dot = host.indexOf(".");
	while (dot !== -1) {
		suffixes.push(host.slice(dot + 1));
		dot = host.indexOf(".", dot + 1);
	}
	return suffixes;
}

export function hostOf(urlOrOrigin: string | undefined): string | null {
	if (!urlOrOrigin || urlOrOrigin === "null") return null;
	try {
		const host = new URL(urlOrOrigin).hostname;
		return host ? host.replace(/^\[|\]$/g, "").toLowerCase() : null;
	} catch {
		return null;
	}
}

export function registrableDomain(host: string): string {
	return getDomain(host, { allowPrivateDomains: true }) ?? host;
}

export function resourceTypeBit(type: string): number {
	const index = RESOURCE_TYPES.indexOf(type as (typeof RESOURCE_TYPES)[number]);
	return 1 << (index === -1 ? RESOURCE_TYPES.indexOf("other") : index);
}

export function prepareRequest(request: DnrRequest): PreparedRequest | null {
	let url: URL;
	try {
		url = new URL(request.url);
	} catch {
		return null;
	}
	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	const initiatorHost = hostOf(request.initiator);
	const method = request.method.toLowerCase();
	return {
		request,
		url,
		hostSuffixes: domainSuffixes(host),
		tokens: urlTokens(request.url.toLowerCase()),
		initiatorSuffixes: initiatorHost ? domainSuffixes(initiatorHost) : [],
		resourceBit: resourceTypeBit(request.resourceType),
		method: KNOWN_METHODS.has(method) ? method : "other",
		// Chrome treats a missing or opaque initiator as third-party.
		thirdParty:
			initiatorHost === null ||
			registrableDomain(initiatorHost) !== registrableDomain(host),
	};
}
