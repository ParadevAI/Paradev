import type { TriggerConfigInput } from "@superset/shared/automation-triggers";
import type { IconType } from "react-icons";
import { FaGithub } from "react-icons/fa";
import { LuClock, LuWebhook } from "react-icons/lu";
import { createGithubConfig, GITHUB_MENU } from "../TriggerSentence";

/**
 * The Add Trigger menu.
 *
 * One recursive shape for every level, so the same table drives both the
 * browsable submenus and the flat list search falls back to — a second,
 * hand-maintained list of searchable events would drift the moment a provider
 * is added.
 */
export type TriggerMenuEntry = {
	label: string;
	/**
	 * Brand marks for providers, matching the integrations settings page —
	 * Lucide's outline glyphs are drawn to sit with the interface icons, so a
	 * GitHub outline next to a real Slack logo reads as two different products.
	 */
	icon?: IconType;
	/** Leaf: choosing it adds this trigger. */
	config?: () => TriggerConfigInput;
	children?: TriggerMenuEntry[];
};

/**
 * dtstart anchors the recurrence, so it is read when the trigger is added
 * rather than when this module loads — otherwise every schedule created in a
 * long-lived window shares the timestamp the app booted at.
 */
function createScheduleConfig(): TriggerConfigInput {
	return {
		kind: "schedule",
		rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
		dtstart: new Date().toISOString(),
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
	};
}

export const TRIGGER_MENU: TriggerMenuEntry[] = [
	{ label: "Scheduled", icon: LuClock, config: createScheduleConfig },
	{
		label: "GitHub",
		icon: FaGithub,
		children: GITHUB_MENU.map((entry) => ({
			label: entry.label,
			...(entry.children
				? {
						children: entry.children.map((child) => ({
							label: child.label,
							config: () => createGithubConfig(child.event),
						})),
					}
				: { config: () => createGithubConfig(entry.event as never) }),
		})),
	},
	{
		label: "Webhook Triggered",
		icon: LuWebhook,
		config: () => ({ kind: "webhook" }),
	},
];

/** A leaf, carrying the trail that leads to it so search can show the path. */
export type TriggerMenuLeaf = {
	path: string[];
	icon?: IconType;
	config: () => TriggerConfigInput;
};

export function flattenTriggerMenu(
	entries: TriggerMenuEntry[] = TRIGGER_MENU,
	trail: string[] = [],
	icon?: IconType,
): TriggerMenuLeaf[] {
	return entries.flatMap((entry) => {
		const path = [...trail, entry.label.replace(/…$/, "")];
		const carried = entry.icon ?? icon;
		if (entry.children)
			return flattenTriggerMenu(entry.children, path, carried);
		return entry.config ? [{ path, icon: carried, config: entry.config }] : [];
	});
}

/**
 * Every term has to appear somewhere in the path, so "github approved" finds
 * "GitHub › PR review submitted › Approved" without the words being adjacent.
 */
export function matchesQuery(leaf: TriggerMenuLeaf, query: string): boolean {
	const haystack = leaf.path.join(" ").toLowerCase();
	return query
		.toLowerCase()
		.split(/\s+/)
		.filter(Boolean)
		.every((term) => haystack.includes(term));
}
