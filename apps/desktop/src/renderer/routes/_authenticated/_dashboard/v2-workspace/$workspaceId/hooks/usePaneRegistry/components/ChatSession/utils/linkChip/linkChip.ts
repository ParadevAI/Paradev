import type { ComposerChip } from "@superset/chat-ui/PromptInput";
import { getPluginIconUrl } from "renderer/components/PluginIcon";
import { parseGithubWorkItemUrl } from "../githubWorkItem";
import { unfurlLink } from "../linkUnfurl";
import { parseSupersetAppLink } from "../supersetAppLink";

export type LinkChipData = { link: string };

const GLOBE_ICON_URL = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>',
)}`;
const ENVIRONMENT_ICON_URL = `data:image/svg+xml,${encodeURIComponent(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#8a8a8a" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z"/><path d="M10 21.9V14L2.1 9.1"/><path d="m10 14 11.9-6.9"/><path d="M14 19.8v-8.1"/><path d="M18 17.5V9.4"/></svg>',
)}`;
const NOTION_ID = /-?[0-9a-f]{32}$/i;

function webUrl(text: string): URL | null {
	if (/\s/.test(text)) return null;
	try {
		const url = new URL(text);
		const plain = !url.username && !url.password && url.hostname !== "";
		return plain && /^https?:$/.test(url.protocol) ? url : null;
	} catch {
		return null;
	}
}

function segments(url: URL): string[] {
	return url.pathname
		.split("/")
		.filter(Boolean)
		.map((segment) => {
			try {
				return decodeURIComponent(segment);
			} catch {
				return segment;
			}
		});
}

function githubLabel(url: URL, href: string): string | null {
	const item = parseGithubWorkItemUrl(href);
	if (item) return `${item.owner}/${item.repo}#${item.number}`;
	const [owner, repo, kind, , ...path] = segments(url);
	if (!owner || !repo) return null;
	if ((kind === "blob" || kind === "tree") && path.length > 0) {
		return path.at(-1) ?? null;
	}
	return kind ? null : `${owner}/${repo}`;
}

function notionLabel(url: URL): string | null {
	const last = segments(url).at(-1);
	const title = last?.replace(NOTION_ID, "").replace(/-/g, " ").trim();
	return title || null;
}

function figmaLabel(url: URL): string | null {
	const [kind, , name] = segments(url);
	if (!kind || !["file", "design", "board", "proto"].includes(kind)) {
		return null;
	}
	return name?.replace(/-/g, " ").trim() || null;
}

function readableLabel(url: URL, href: string): string | null {
	const host = url.hostname.replace(/^www\./, "");
	if (host === "github.com") return githubLabel(url, href);
	if (/(^|\.)notion\.(so|site)$/.test(host)) return notionLabel(url);
	if (/(^|\.)figma\.com$/.test(host)) return figmaLabel(url);
	return null;
}

/**
 * A pasted web link as a composer chip: a readable name where the URL has
 * one (`owner/repo#12`, a Linear issue id, a Notion page title), the app's
 * icon where Superset knows the app, and the URL itself as what is sent.
 */
export function linkChip(
	text: string,
	options: { webUrl: string; isDark: boolean; chatLabel?: string },
): ComposerChip | null {
	const url = webUrl(text);
	if (!url) return null;
	const chat =
		parseSupersetAppLink(text, options.webUrl)?.kind === "chat"
			? options.chatLabel
			: undefined;
	const unfurl = unfurlLink(text, false, options.webUrl);
	const iconUrl =
		unfurl?.icon.kind === "plugin"
			? getPluginIconUrl(unfurl.icon.name, options.isDark)
			: unfurl?.icon.kind === "environment"
				? ENVIRONMENT_ICON_URL
				: undefined;
	return {
		label: chat ?? readableLabel(url, text) ?? unfurl?.label ?? text,
		serialized: text,
		iconUrl: iconUrl ?? GLOBE_ICON_URL,
		description: text,
		data: { link: text } satisfies LinkChipData,
	};
}

export function linkOfChip(chip: ComposerChip): string | null {
	const link = (chip.data as Partial<LinkChipData> | undefined)?.link;
	return typeof link === "string" ? link : null;
}

export function chipLink(chip: ComposerChip): string | null {
	return linkOfChip(chip) ?? (webUrl(chip.serialized) ? chip.serialized : null);
}
