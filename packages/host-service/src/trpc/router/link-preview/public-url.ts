import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** A link the preview will not load, or could not. An expected state, never a bug. */
export class LinkPreviewUnavailableError extends Error {
	override name = "LinkPreviewUnavailableError";
}

export type LookupAddresses = (hostname: string) => Promise<string[]>;

export const lookupAddresses: LookupAddresses = async (hostname) =>
	(await lookup(hostname, { all: true })).map((entry) => entry.address);

const MAX_URL_LENGTH = 8192;

function isPublicIpv4(octets: number[]): boolean {
	const [a = 0, b = 0, c = 0] = octets;
	return !(
		a === 0 ||
		a === 10 ||
		a === 127 ||
		(a === 100 && b >= 64 && b <= 127) ||
		(a === 169 && b === 254) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 0 && (c === 0 || c === 2)) ||
		(a === 192 && b === 168) ||
		(a === 198 && (b === 18 || b === 19)) ||
		(a === 198 && b === 51 && c === 100) ||
		(a === 203 && b === 0 && c === 113) ||
		a >= 224
	);
}

function ipv6Segments(address: string): number[] {
	let text = address;
	const tail = text.slice(text.lastIndexOf(":") + 1);
	if (tail.includes(".")) {
		const [a = 0, b = 0, c = 0, d = 0] = tail.split(".").map(Number);
		const high = ((a << 8) | b).toString(16);
		const low = ((c << 8) | d).toString(16);
		text = `${text.slice(0, text.lastIndexOf(":") + 1)}${high}:${low}`;
	}
	const [head = "", rest] = text.split("::");
	const groups = (part: string) =>
		part === ""
			? []
			: part.split(":").map((group) => Number.parseInt(group, 16));
	const left = groups(head);
	if (rest === undefined) return left;
	const right = groups(rest);
	const zeros = new Array<number>(8 - left.length - right.length).fill(0);
	return [...left, ...zeros, ...right];
}

function isPublicIpv6(address: string): boolean {
	const segments = ipv6Segments(address);
	const [first = 0, second = 0] = segments;
	const embedsIpv4 =
		segments.slice(0, 5).every((segment) => segment === 0) &&
		(segments[5] === 0 || segments[5] === 0xffff);
	if (embedsIpv4) {
		const [high = 0, low = 0] = segments.slice(6);
		return isPublicIpv4([high >> 8, high & 0xff, low >> 8, low & 0xff]);
	}
	return !(
		(first & 0xff00) === 0xff00 ||
		(first & 0xfe00) === 0xfc00 ||
		(first & 0xffc0) === 0xfe80 ||
		(first & 0xffc0) === 0xfec0 ||
		(first === 0x2001 && second === 0x0db8)
	);
}

export function isPublicAddress(address: string): boolean {
	const bare = address.replace(/%.*$/, "");
	const version = isIP(bare);
	if (version === 4) return isPublicIpv4(bare.split(".").map(Number));
	return version === 6 && isPublicIpv6(bare);
}

export function parseWebUrl(raw: string, base?: URL): URL {
	const value = raw.trim();
	if (value && value.length <= MAX_URL_LENGTH) {
		try {
			return new URL(value, base);
		} catch {}
	}
	throw new LinkPreviewUnavailableError("The link is not a valid URL");
}

/**
 * Refuses a target that is not a plain web URL on the public internet. Every
 * hop of a preview fetch passes through here before a request leaves the host.
 */
export async function assertPublicTarget(
	url: URL,
	lookupHost: LookupAddresses,
): Promise<void> {
	if (
		(url.protocol !== "http:" && url.protocol !== "https:") ||
		url.username ||
		url.password ||
		!url.hostname
	) {
		throw new LinkPreviewUnavailableError("The link is not a plain web URL");
	}
	const host = url.hostname
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "")
		.toLowerCase();
	if (isIP(host)) {
		if (isPublicAddress(host)) return;
		throw new LinkPreviewUnavailableError("Private addresses have no preview");
	}
	if (
		host === "localhost" ||
		host.endsWith(".localhost") ||
		host.endsWith(".local")
	) {
		throw new LinkPreviewUnavailableError("Local hosts have no preview");
	}
	const addresses = await lookupHost(host).catch((cause: unknown) => {
		throw new LinkPreviewUnavailableError("The host did not resolve", {
			cause,
		});
	});
	if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
		throw new LinkPreviewUnavailableError("Private addresses have no preview");
	}
}
