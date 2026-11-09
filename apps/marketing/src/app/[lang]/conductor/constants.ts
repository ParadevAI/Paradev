import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { COMPANY } from "@superset/shared/constants";

export const CONDUCTOR_ANNOUNCEMENT_URL =
	"https://www.conductor.build/announcement";
export const MIGRATE_LOCAL_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor`;
export const MIGRATE_CLOUD_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor-cloud`;
export const COMPARE_PATH = "/compare/superset-vs-conductor";

export const ANNOUNCED_DATE = new Date(Date.UTC(2026, 10, 4));
export const READ_ONLY_DATE = new Date(Date.UTC(2026, 10, 13));
export const SHUTDOWN_DATE = new Date(Date.UTC(2026, 10, 20));

interface TextLink {
	label: MessageDescriptor;
	href: string;
}

interface Highlight {
	title: MessageDescriptor;
	detail: MessageDescriptor;
}

export const HIGHLIGHTS: Highlight[] = [
	{
		title: msg({ message: "No lock-in" }),
		detail: msg({
			message:
				"Open source under MIT. Use any agent on your own subscriptions and keys.",
		}),
	},
	{
		title: msg({ message: "Chat" }),
		detail: msg({
			message:
				"A chat interface for Claude Code, Codex, OpenCode, and Pi. Picks up your Claude Code sessions.",
		}),
	},
	{
		title: msg({ message: "Cloud" }),
		detail: msg({ message: "Agents keep working when your laptop is closed." }),
	},
	{
		title: msg({ message: "Mobile" }),
		detail: msg({
			message: "Check on agents and review their work from iPhone or iPad.",
		}),
	},
];

interface TimelineEntry {
	date: Date | null;
	dateTime: string;
	dateLabel?: MessageDescriptor;
	title: MessageDescriptor;
	detail: MessageDescriptor;
	urgent?: boolean;
}

export const TIMELINE: TimelineEntry[] = [
	{
		date: ANNOUNCED_DATE,
		dateTime: "2026-11-04",
		title: msg({ message: "Conductor joins Meta" }),
		detail: msg({ message: "The team announced the news." }),
	},
	{
		date: READ_ONLY_DATE,
		dateTime: "2026-11-13",
		title: msg({ message: "Cloud goes read-only" }),
		detail: msg({ message: "You can read and export, but not run agents." }),
		urgent: true,
	},
	{
		date: SHUTDOWN_DATE,
		dateTime: "2026-11-20",
		title: msg({ message: "Cloud shuts down" }),
		detail: msg({
			message: "Cloud data gets deleted. Push your branches first.",
		}),
		urgent: true,
	},
	{
		date: null,
		dateTime: "2027",
		dateLabel: msg({ message: "Early 2027" }),
		title: msg({ message: "Mac app winds down" }),
		detail: msg({ message: "Local work can move at your own pace." }),
	},
];

interface MigrationStep {
	title: MessageDescriptor;
	detail: MessageDescriptor;
	link?: TextLink;
	download?: boolean;
	optional?: boolean;
}

export const MIGRATION_STEPS: MigrationStep[] = [
	{
		title: msg({ message: "Download {companyName}" }),
		detail: msg({
			message: "Free for one user. macOS, with an experimental Linux build.",
		}),
		download: true,
	},
	{
		title: msg({ message: "Add your repos" }),
		detail: msg({
			message:
				"{companyName} finds your Conductor worktrees and imports them in place, with uncommitted changes.",
		}),
		link: {
			label: msg({ message: "Migration guide" }),
			href: MIGRATE_LOCAL_URL,
		},
	},
	{
		title: msg({ message: "Pick your agents" }),
		detail: msg({
			message: "They run on the subscriptions and keys you already have.",
		}),
		link: {
			label: msg({ message: "Supported agents" }),
			href: `${COMPANY.DOCS_URL}/supported-agents`,
		},
	},
	{
		title: msg({ message: "Move cloud work" }),
		detail: msg({
			message:
				"Push your branches, then keep going on your Mac or in a {companyName} cloud workspace.",
		}),
		link: {
			label: msg({ message: "Conductor Cloud guide" }),
			href: MIGRATE_CLOUD_URL,
		},
		optional: true,
	},
];

interface ComparisonRow {
	id: string;
	label: MessageDescriptor;
	paradev: MessageDescriptor;
	unpricedParadev?: MessageDescriptor;
	conductor: MessageDescriptor;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
	{
		id: "status",
		label: msg({ message: "Status" }),
		paradev: msg({ message: "Available" }),
		conductor: msg({
			message: "Cloud ends {shutdownDate}. Mac app ends early 2027",
		}),
	},
	{
		id: "worktrees",
		label: msg({ message: "Worktree per task" }),
		paradev: msg({ message: "Yes" }),
		conductor: msg({ message: "Yes" }),
	},
	{
		id: "agents",
		label: msg({ message: "Agents" }),
		paradev: msg({
			message:
				"Claude Code, Codex, Cursor Agent, OpenCode, Gemini, Amp, any CLI",
		}),
		conductor: msg({ message: "Claude Code, Codex, Cursor, OpenCode" }),
	},
	{
		id: "cloud",
		label: msg({ message: "Cloud workspaces" }),
		paradev: msg({ message: "Team and Ultra plans" }),
		conductor: msg({ message: "Shuts down {shutdownDate}" }),
	},
	{
		id: "chat",
		label: msg({ message: "Chat interface" }),
		paradev: msg({ message: "Yes, resumes Claude Code sessions" }),
		conductor: msg({ message: "Yes" }),
	},
	{
		id: "automations",
		label: msg({ message: "Automations" }),
		paradev: msg({ message: "Local, on a host, or in the cloud" }),
		conductor: msg({ message: "Routines, ending with Cloud" }),
	},
	{
		id: "phone",
		label: msg({ message: "Phone" }),
		paradev: msg({ message: "iPhone and iPad" }),
		conductor: msg({ message: "iOS app, ending {shutdownDate}" }),
	},
	{
		id: "platforms",
		label: msg({ message: "Platforms" }),
		paradev: msg({ message: "macOS, Linux (experimental)" }),
		conductor: msg({ message: "macOS" }),
	},
	{
		id: "price",
		label: msg({ message: "Price" }),
		paradev: msg({
			message: "Free for one user. Pro from {proPrice}/user/mo",
		}),
		unpricedParadev: msg({ message: "Free for one user. Paid plans per user" }),
		conductor: msg({ message: "No longer on sale" }),
	},
];

export const TRANSFERS: MessageDescriptor[] = [
	msg({ message: "Repos, worktrees and branches" }),
	msg({ message: "Uncommitted changes" }),
	msg({ message: "Your agent subscriptions and keys" }),
	msg({ message: "Claude Code sessions, with claude --resume" }),
	msg({ message: "Setup scripts, once you convert conductor.json" }),
];

export const DOES_NOT_TRANSFER: MessageDescriptor[] = [
	msg({
		message:
			"Conductor chat history. Export it in Conductor under Settings → Account",
	}),
	msg({ message: "Unpushed Cloud work. Push before {shutdownDate}" }),
	msg({ message: "Git-ignored files in Cloud, like .env. Copy them out" }),
];

interface FaqItem {
	id: string;
	question: MessageDescriptor;
	answer: MessageDescriptor;
	unpricedAnswer?: MessageDescriptor;
	link?: TextLink;
}

export const FAQ_ITEMS: FaqItem[] = [
	{
		id: "open-source",
		question: msg({ message: "Is {companyName} open source?" }),
		answer: msg({
			message:
				"Yes, under the MIT License. You can fork the code and build it yourself, so you're never locked in.",
		}),
		link: {
			label: msg({ message: "View on GitHub" }),
			href: COMPANY.GITHUB_URL,
		},
	},
	{
		id: "model-calls",
		question: msg({ message: "Do you proxy my model calls?" }),
		answer: msg({
			message:
				"Not on your machine. Agents call their providers directly and bill you there. In cloud workspaces, your keys never enter the sandbox. {companyName} adds your sign-in to outgoing requests.",
		}),
		link: {
			label: msg({ message: "Cloud credentials" }),
			href: `${COMPANY.DOCS_URL}/cloud-workspaces#credentials`,
		},
	},
	{
		id: "windows",
		question: msg({ message: "Does it run on Windows?" }),
		answer: msg({
			message:
				"Not yet. It runs on macOS, with an experimental Linux build. Windows users can join the waitlist from the download button.",
		}),
	},
	{
		id: "pricing",
		question: msg({ message: "How much does it cost?" }),
		answer: msg({
			message:
				"Free for one user. Pro is {proPrice} per user per month and adds automations and the mobile app. Team is {teamPrice} and adds cloud workspaces.",
		}),
		unpricedAnswer: msg({
			message:
				"Free for one user. Pro adds automations and the mobile app. Team adds cloud workspaces.",
		}),
		link: { label: msg({ message: "See pricing" }), href: "/pricing" },
	},
	{
		id: "team",
		question: msg({ message: "Can my team share workspaces?" }),
		answer: msg({ message: "Yes, on paid plans." }),
		link: { label: msg({ message: "Cloud workspaces" }), href: "/cloud" },
	},
	{
		id: "cloud-data",
		question: msg({ message: "What happens to my Conductor Cloud data?" }),
		answer: msg({
			message:
				"Conductor deletes it after {shutdownDate}, and {companyName} can't reach it. Push your branches and export your chats before then.",
		}),
		link: {
			label: msg({ message: "Conductor Cloud guide" }),
			href: MIGRATE_CLOUD_URL,
		},
	},
];
