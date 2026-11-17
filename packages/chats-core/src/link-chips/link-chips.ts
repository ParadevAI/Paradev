import { BUILTIN_LINK_RULES } from "../link-rules/builtin-link-rules.ts";
import { type LinkRule, resolveLink } from "../link-rules/link-rules.ts";
import { markNamed, type PluginMark } from "../plugin-marks/plugin-marks.ts";
import { toolkitName } from "../toolkits/toolkits.ts";

/** A link to an app Dev knows, as a chip: the app's mark and a name for what it points at. */
export interface LinkChip {
	/** The plugin mark's slug ("linear", "google-calendar"). */
	app: string;
	mark: PluginMark;
	/** "SUPER-3353", "owner/repo#12", a Notion page's title; else the app's name. */
	label: string;
}

const LABEL_MAX = 60;

/**
 * A link to an app Dev knows as a chip (its mark, and "SUPER-3353" or "owner/repo#12" rather than the address), as
 * Superset's composer unfurls a pasted link: from the address and the apps' link rules alone, with no fetch. Only apps
 * with a mark make a chip; every other link is null.
 */
export function linkChip(
	href: string,
	rules: readonly LinkRule[] = BUILTIN_LINK_RULES,
): LinkChip | null {
	const link = resolveLink(href, rules);
	const mark = link ? markNamed(link.app) : undefined;
	if (!link || !mark) return null;
	const label = link.label || toolkitName(link.app);
	return {
		app: link.app,
		mark,
		label:
			label.length > LABEL_MAX
				? `${label.slice(0, LABEL_MAX - 1).trimEnd()}…`
				: label,
	};
}
