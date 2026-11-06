import { COMPANY } from "@superset/shared/constants";

export const CONDUCTOR_ANNOUNCEMENT_URL =
	"https://www.conductor.build/announcement";
export const MIGRATE_LOCAL_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor`;
export const MIGRATE_CLOUD_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor-cloud`;
export const COMPARE_PATH = "/compare/superset-vs-conductor";

interface TextLink {
	label: string;
	href: string;
}

interface Highlight {
	title: string;
	detail: string;
	beta?: boolean;
}

export const HIGHLIGHTS: Highlight[] = [
	{
		title: "No lock-in",
		detail:
			"Open source under MIT. Use any agent on your own subscriptions and keys.",
	},
	{
		title: "Chat",
		detail: "A chat UI built for agents. Picks up your Claude Code sessions.",
	},
	{
		title: "Cloud",
		detail: "Agents keep working when your laptop is closed.",
		beta: true,
	},
	{
		title: "Mobile",
		detail: "Check on agents and review their work from iPhone or iPad.",
	},
];

interface TimelineEntry {
	date: string;
	dateTime: string;
	title: string;
	detail: string;
	urgent?: boolean;
}

export const TIMELINE: TimelineEntry[] = [
	{
		date: "Nov 4",
		dateTime: "2026-11-04",
		title: "Conductor joins Meta",
		detail: "The team announced the news.",
	},
	{
		date: "Nov 13",
		dateTime: "2026-11-13",
		title: "Cloud goes read-only",
		detail: "You can read and export, but not run agents.",
		urgent: true,
	},
	{
		date: "Nov 20",
		dateTime: "2026-11-20",
		title: "Cloud shuts down",
		detail: "Cloud data gets deleted. Push your branches first.",
		urgent: true,
	},
	{
		date: "Early 2027",
		dateTime: "2027",
		title: "Mac app winds down",
		detail: "Local work can move at your own pace.",
	},
];

interface MigrationStep {
	title: string;
	detail: string;
	link?: TextLink;
	/** Render the tracked download button (source "conductor") under the step. */
	download?: boolean;
	optional?: boolean;
}

export const MIGRATION_STEPS: MigrationStep[] = [
	{
		title: "Download Paradev",
		detail: "Free for one user. macOS, with an experimental Linux build.",
		download: true,
	},
	{
		title: "Add your repos",
		detail:
			"Paradev finds your Conductor worktrees and imports them in place, with uncommitted changes.",
		link: { label: "Migration guide", href: MIGRATE_LOCAL_URL },
	},
	{
		title: "Pick your agents",
		detail: "They run on the subscriptions and keys you already have.",
		link: {
			label: "Supported agents",
			href: `${COMPANY.DOCS_URL}/supported-agents`,
		},
	},
	{
		title: "Move cloud work",
		detail:
			"Push your branches, then keep going on your Mac or in a Paradev cloud workspace.",
		link: { label: "Conductor Cloud guide", href: MIGRATE_CLOUD_URL },
		optional: true,
	},
];

interface ComparisonRow {
	label: string;
	paradev: string;
	conductor: string;
	beta?: boolean;
	unpricedParadev?: string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
	{
		label: "Status",
		paradev: "Available",
		conductor: "Cloud ends Nov 20. Mac app ends early 2027",
	},
	{
		label: "Worktree per task",
		paradev: "Yes",
		conductor: "Yes",
	},
	{
		label: "Agents",
		paradev: "Claude Code, Codex, Cursor Agent, OpenCode, Gemini, Amp, any CLI",
		conductor: "Claude Code, Codex, Cursor, OpenCode",
	},
	{
		label: "Cloud workspaces",
		paradev: "Team and Ultra plans",
		conductor: "Shuts down Nov 20",
		beta: true,
	},
	{
		label: "Chat UI",
		paradev: "Yes, resumes Claude Code sessions",
		conductor: "Yes",
	},
	{
		label: "Automations",
		paradev: "Local, on a host, or in the cloud",
		conductor: "Routines, ending with Cloud",
	},
	{
		label: "Phone",
		paradev: "iPhone and iPad",
		conductor: "iOS app, ending Nov 20",
	},
	{
		label: "Platforms",
		paradev: "macOS, Linux (experimental)",
		conductor: "macOS",
	},
	{
		label: "Price",
		paradev: "Free for one user. Pro from {{price:pro}}/user/mo",
		unpricedParadev: "Free for one user. Paid plans per user",
		conductor: "No longer on sale",
	},
];

export const TRANSFERS: string[] = [
	"Repos, worktrees and branches",
	"Uncommitted changes",
	"Your agent subscriptions and keys",
	"Claude Code sessions, with claude --resume",
	"Setup scripts, once you convert conductor.json",
];

export const DOES_NOT_TRANSFER: string[] = [
	"Conductor chat history. Export it in Conductor under Settings → Account",
	"Unpushed Cloud work. Push before Nov 20",
	"Git-ignored files in Cloud, like .env. Copy them out",
];

interface FaqItem {
	id: string;
	question: string;
	answer: string;
	unpricedAnswer?: string;
	link?: TextLink;
}

export const FAQ_ITEMS: FaqItem[] = [
	{
		id: "open-source",
		question: "Is Paradev open source?",
		answer:
			"Yes, under the MIT License. You can fork the code and build it yourself, so you're never locked in.",
		link: { label: "View on GitHub", href: COMPANY.GITHUB_URL },
	},
	{
		id: "model-calls",
		question: "Do you proxy my model calls?",
		answer:
			"Not on your machine. Agents call their providers directly and bill you there. In cloud workspaces, your keys never enter the sandbox. Paradev adds your sign-in to outgoing requests.",
		link: {
			label: "Cloud credentials",
			href: `${COMPANY.DOCS_URL}/cloud-workspaces#credentials`,
		},
	},
	{
		id: "windows",
		question: "Does it run on Windows?",
		answer:
			"Not yet. It runs on macOS, with an experimental Linux build. Windows users can join the waitlist from the download button.",
	},
	{
		id: "pricing",
		question: "How much does it cost?",
		answer:
			"Free for one user. Pro is {{price:pro}} per user per month and adds automations and the mobile app. Team is {{price:team}} and adds cloud workspaces.",
		unpricedAnswer:
			"Free for one user. Pro adds automations and the mobile app. Team adds cloud workspaces.",
		link: { label: "See pricing", href: "/pricing" },
	},
	{
		id: "team",
		question: "Can my team share workspaces?",
		answer: "Yes, on paid plans.",
		link: { label: "Cloud workspaces", href: "/cloud" },
	},
	{
		id: "cloud-data",
		question: "What happens to my Conductor Cloud data?",
		answer:
			"Conductor deletes it after Nov 20, and Paradev can't reach it. Push your branches and export your chats before then.",
		link: { label: "Conductor Cloud guide", href: MIGRATE_CLOUD_URL },
	},
];
