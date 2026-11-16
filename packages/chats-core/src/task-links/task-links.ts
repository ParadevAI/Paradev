import { BUILTIN_LINK_RULES } from "../link-rules/builtin-link-rules.ts";
import {
	type LinkRule,
	resolveLink,
	rewrittenAddresses,
} from "../link-rules/link-rules.ts";
import { markNamed } from "../plugin-marks/plugin-marks.ts";

/** The most links a task keeps. */
export const MAX_TASK_LINKS = 20;

const URL_IN_TEXT = /https?:\/\/[^\s<>"'`)\]]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?*_]+$/;

/**
 * The links in a task's words that point into an app with a link rule (a Linear issue, a Slack message, a Notion page, a
 * Superset workspace or page, a GitHub pull request…), in order, once each, as web addresses: what the API saves on the
 * task so nobody, Dev or person, has to attach them. An app's other spellings (Superset's desktop address for a
 * workspace) become its web one. Other links stay in the text.
 */
export function discoverTaskLinks(
	text: string,
	rules: readonly LinkRule[] = BUILTIN_LINK_RULES,
): string[] {
	const found = rewrittenAddresses(text, rules);
	for (const match of text.matchAll(URL_IN_TEXT))
		found.push({
			at: match.index,
			url: match[0].replace(TRAILING_PUNCTUATION, ""),
		});
	const urls = found
		.sort((a, b) => a.at - b.at)
		.map((f) => resolveLink(f.url, rules))
		.flatMap((link) => (link && markNamed(link.app) ? [link.url] : []));
	return [...new Set(urls)].slice(0, MAX_TASK_LINKS);
}

/** The saved links with the newly discovered ones after them; a link stays once found, even if the words that had it change. */
export function mergeTaskLinks(
	saved: readonly string[],
	found: readonly string[],
): string[] {
	return [...new Set([...saved, ...found])].slice(0, MAX_TASK_LINKS);
}
