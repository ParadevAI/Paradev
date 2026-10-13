import { decodeHTML, decodeHTMLAttribute } from "entities";

const MAX_TITLE_LENGTH = 240;
const ATTRIBUTE =
	/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function cleanText(value: string): string | null {
	const text = decodeHTML(value.replace(/<[^>]*>/g, ""))
		.replace(/\s+/g, " ")
		.trim();
	return text ? Array.from(text).slice(0, MAX_TITLE_LENGTH).join("") : null;
}

function openingTags(
	html: string,
	name: "meta" | "link",
): Map<string, string>[] {
	const tag = new RegExp(`<${name}\\b((?:"[^"]*"|'[^']*'|[^'">])*)>`, "gi");
	return Array.from(html.matchAll(tag), (match) => {
		const attributes = new Map<string, string>();
		for (const [, key = "", double, single, bare] of (match[1] ?? "").matchAll(
			ATTRIBUTE,
		)) {
			const attribute = key.toLowerCase();
			if (!attributes.has(attribute)) {
				attributes.set(attribute, double ?? single ?? bare ?? "");
			}
		}
		return attributes;
	});
}

export function documentTitle(html: string): string | null {
	const metas = openingTags(html, "meta");
	for (const key of ["og:title", "twitter:title"]) {
		for (const meta of metas) {
			const marker = meta.get("property") ?? meta.get("name");
			if (marker?.toLowerCase() !== key) continue;
			const title = cleanText(meta.get("content") ?? "");
			if (title) return title;
		}
	}
	const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	return title ? cleanText(title[1] ?? "") : null;
}

export function documentIconHrefs(html: string): string[] {
	return openingTags(html, "link").flatMap((link) => {
		const rel = (link.get("rel") ?? "").toLowerCase().split(/\s+/);
		const href = decodeHTMLAttribute(link.get("href") ?? "").trim();
		if (!rel.includes("icon") || !href) return [];
		const isSvg =
			link.get("type")?.toLowerCase() === "image/svg+xml" ||
			/\.svg(?:[?#]|$)/i.test(href);
		return isSvg ? [] : [href];
	});
}
