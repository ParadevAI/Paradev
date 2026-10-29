import { decodeHTML, decodeHTMLAttribute } from "entities";

const MAX_TITLE_LENGTH = 240;
const MAX_DESCRIPTION_LENGTH = 300;
const ATTRIBUTE =
	/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
function cleanText(value: string, maxLength: number): string | null {
	const text = decodeHTML(value.replace(/<[^>]*>/g, ""))
		.replace(/\s+/g, " ")
		.trim();
	return text ? Array.from(text).slice(0, maxLength).join("") : null;
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

function metaContent(
	html: string,
	keys: readonly string[],
	clean: (value: string) => string | null,
): string | null {
	const metas = openingTags(html, "meta");
	for (const key of keys) {
		for (const meta of metas) {
			const marker = meta.get("property") ?? meta.get("name");
			if (marker?.toLowerCase() !== key) continue;
			const content = clean(meta.get("content") ?? "");
			if (content) return content;
		}
	}
	return null;
}

export function documentTitle(html: string): string | null {
	const clean = (value: string) => cleanText(value, MAX_TITLE_LENGTH);
	const social = metaContent(html, ["og:title", "twitter:title"], clean);
	if (social) return social;
	const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
	return title ? clean(title[1] ?? "") : null;
}

export function documentDescription(html: string): string | null {
	return metaContent(
		html,
		["og:description", "twitter:description", "description"],
		(value) => cleanText(value, MAX_DESCRIPTION_LENGTH),
	);
}

export function documentImageHref(html: string): string | null {
	return metaContent(
		html,
		[
			"og:image:secure_url",
			"og:image",
			"og:image:url",
			"twitter:image",
			"twitter:image:src",
		],
		(value) => decodeHTMLAttribute(value).trim() || null,
	);
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
