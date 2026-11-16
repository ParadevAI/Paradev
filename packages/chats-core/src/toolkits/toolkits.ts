import { markNamed, type PluginMark } from "../plugin-marks/plugin-marks.ts";

/** Composio toolkits Dev knows by name; others still work and show their slug, capitalised. */
const TOOLKIT_NAMES: Record<string, string> = {
	linear: "Linear",
	gmail: "Gmail",
	googlecalendar: "Google Calendar",
	github: "GitHub",
	slack: "Slack",
	notion: "Notion",
	stripe: "Stripe",
	ynab: "YNAB",
	vercel: "Vercel",
	posthog: "PostHog",
	superset: "Superset",
	typefully: "Typefully",
	autumn: "Autumn",
	tasks: "Tasks",
};

/** What each known app lets a Dev do, in a line, as an integrations list shows it under the name. */
const TOOLKIT_DESCRIPTIONS: Record<string, string> = {
	linear: "Issues, comments and projects",
	gmail: "Read and act on your email",
	googlecalendar: "Your events and invitations",
	github: "Repositories, issues and pull requests",
	slack: "Messages, channels and threads",
	notion: "Pages and databases",
	stripe: "Payments, customers and subscriptions",
	ynab: "Budgets, accounts and transactions",
	vercel: "Projects, deployments and domains",
	posthog: "Product analytics, errors and feature flags",
	superset: "Workspaces, coding agents and tasks",
	typefully: "Drafts and scheduled posts for X, LinkedIn and more",
	autumn: "Customers, plans, balances and usage billing",
	tasks: "Comments on tasks",
};

/** Composio's slugs whose mark goes by another name; the rest share plugin-marks' slug once `_` and `-` are gone. */
const MARK_ALIASES: Record<string, string> = {
	googlecalendar: "google-calendar",
};

// Composio writes some slugs with "_" or "-" ("google_calendar"); the tables above key them without.
const keyOf = (slug: string) => slug.toLowerCase().replace(/[-_\s]/g, "");

/** A toolkit's name as both apps show it: "Linear", "Google Calendar", else the slug capitalised ("acme" → "Acme"). */
export function toolkitName(slug: string): string {
	const known = TOOLKIT_NAMES[keyOf(slug)];
	if (known) return known;
	return slug.charAt(0).toUpperCase() + slug.slice(1);
}

/** A known toolkit's one line ("Read and act on your email"); null for the rest, which show their name alone. */
export function toolkitDescription(slug: string): string | null {
	return TOOLKIT_DESCRIPTIONS[keyOf(slug)] ?? null;
}

/** A toolkit's brand mark ("googlecalendar" → Google Calendar's); else undefined. */
export function toolkitMark(slug: string): PluginMark | undefined {
	const key = keyOf(slug);
	return markNamed(MARK_ALIASES[key] ?? key);
}

/** The letter on a toolkit's tile when it has no mark: its name's initial. */
export function toolkitLetter(slug: string): string {
	return toolkitName(slug).charAt(0).toUpperCase();
}
