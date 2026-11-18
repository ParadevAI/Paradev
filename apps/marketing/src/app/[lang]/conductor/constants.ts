import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { COMPANY } from "@superset/shared/constants";

export const MIGRATE_LOCAL_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor`;
export const MIGRATE_CLOUD_URL = `${COMPANY.DOCS_URL}/migrate-from-conductor-cloud`;
export const COMPARE_PATH = "/compare/superset-vs-conductor";

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
		paradev: msg({ message: "Paid plans" }),
		conductor: msg({ message: "Cloud workspaces" }),
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
		conductor: msg({ message: "Routines" }),
	},
	{
		id: "phone",
		label: msg({ message: "Phone" }),
		paradev: msg({ message: "iPhone and iPad" }),
		conductor: msg({
			message: "iOS app; cloud and experimental local Mac remote control",
		}),
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
		conductor: msg({
			message: "See Conductor for current plans and account access",
		}),
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
	msg({
		message: "Unpushed cloud changes. Save and push the work you want to move.",
	}),
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
				"No. {companyName} never proxies model calls. Agents use your own subscriptions and keys.",
		}),
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
				"Free for one user. Pro is {proPrice} per user per month and adds automations and the mobile app. Team is {teamPrice}. Paid plans can access cloud workspaces. See pricing for included usage and metered extras.",
		}),
		unpricedAnswer: msg({
			message:
				"Free for one user. Pro adds automations and the mobile app. Paid plans can access cloud workspaces. See pricing for included usage and metered extras.",
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
				"If you choose to move, save your branches and export the data you want to keep. Exports do not import Conductor chats into {companyName}.",
		}),
		link: {
			label: msg({ message: "Conductor Cloud guide" }),
			href: MIGRATE_CLOUD_URL,
		},
	},
];
