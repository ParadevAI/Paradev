import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { COMPANY } from "@superset/shared/constants";

export const MIGRATE_URL = `${COMPANY.DOCS_URL}/migrate-from-t3-code`;
export const COMPARE_PATH = "/compare/superset-vs-t3-code";

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
		title: msg({ message: "Chat" }),
		detail: msg({
			message:
				"Agents open as a chat, like a T3 Code thread. Switch the same session to its CLI in a terminal at any time.",
		}),
	},
	{
		title: msg({ message: "Any CLI agent" }),
		detail: msg({
			message:
				"Run any agent that has a CLI, on your own subscriptions and keys.",
		}),
	},
	{
		title: msg({ message: "Review" }),
		detail: msg({
			message:
				"See CI checks and review threads next to the diff, and send comments back to the agent.",
		}),
	},
	{
		title: msg({ message: "Cloud" }),
		detail: msg({ message: "Agents keep working when your laptop is closed." }),
	},
];

interface MigrationStep {
	title: MessageDescriptor;
	detail: MessageDescriptor;
	link?: TextLink;
	download?: boolean;
}

export const MIGRATION_STEPS: MigrationStep[] = [
	{
		title: msg({ message: "Download {companyName}" }),
		detail: msg({
			message: "Free for one user. macOS and Linux.",
		}),
		download: true,
	},
	{
		title: msg({ message: "Add your repos" }),
		detail: msg({
			message:
				"{companyName} finds your T3 Code worktrees and imports them in place, with uncommitted changes.",
		}),
		link: {
			label: msg({ message: "Migration guide" }),
			href: MIGRATE_URL,
		},
	},
	{
		title: msg({ message: "Convert your actions" }),
		detail: msg({
			message:
				"Move the actions in t3.json to .paradev/config.json, or ask an agent to do it for you.",
		}),
		link: {
			label: msg({ message: "Convert your actions" }),
			href: `${MIGRATE_URL}#3-convert-your-actions`,
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
];

interface ComparisonRow {
	id: string;
	label: MessageDescriptor;
	paradev: MessageDescriptor;
	unpricedParadev?: MessageDescriptor;
	t3Code: MessageDescriptor;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
	{
		id: "worktrees",
		label: msg({ message: "Worktree per task" }),
		paradev: msg({ message: "Yes" }),
		t3Code: msg({ message: "Yes, or the current checkout" }),
	},
	{
		id: "interface",
		label: msg({ message: "How you work" }),
		paradev: msg({
			message: "Chat, or the agent's own CLI in a terminal",
		}),
		t3Code: msg({ message: "Chat threads, with a built-in terminal" }),
	},
	{
		id: "agents",
		label: msg({ message: "Agents" }),
		paradev: msg({
			message:
				"Claude Code, Codex, Cursor Agent, OpenCode, Gemini, Amp, any CLI",
		}),
		t3Code: msg({
			message:
				"Claude Code, Codex, Cursor, OpenCode, Grok Build, Antigravity, Kiro, Pi, Muse Code, fx, and ACP agents",
		}),
	},
	{
		id: "cloud",
		label: msg({ message: "Cloud workspaces" }),
		paradev: msg({ message: "Paid plans" }),
		t3Code: msg({ message: "No. Runs on machines you own" }),
	},
	{
		id: "automations",
		label: msg({ message: "Automations" }),
		paradev: msg({ message: "Local, on a host, or in the cloud" }),
		t3Code: msg({ message: "Scheduled tasks, webhook tasks, and workflows" }),
	},
	{
		id: "phone",
		label: msg({ message: "Phone" }),
		paradev: msg({ message: "iPhone, iPad, and Android" }),
		t3Code: msg({ message: "iOS and Android" }),
	},
	{
		id: "platforms",
		label: msg({ message: "Platforms" }),
		paradev: msg({ message: "macOS, Linux" }),
		t3Code: msg({ message: "macOS, Windows, Linux" }),
	},
	{
		id: "license",
		label: msg({ message: "License" }),
		paradev: msg({ message: "Open source (MIT)" }),
		t3Code: msg({ message: "Open source (MIT)" }),
	},
	{
		id: "price",
		label: msg({ message: "Price" }),
		paradev: msg({
			message: "Free for one user. Pro from {proPrice}/user/mo",
		}),
		unpricedParadev: msg({ message: "Free for one user. Paid plans per user" }),
		t3Code: msg({ message: "Free" }),
	},
];

export const TRANSFERS: MessageDescriptor[] = [
	msg({ message: "Repos, worktrees and branches" }),
	msg({ message: "Uncommitted changes" }),
	msg({ message: "Your agent subscriptions and keys" }),
	msg({ message: "Setup scripts, once you convert t3.json" }),
];

export const DOES_NOT_TRANSFER: MessageDescriptor[] = [
	msg({
		message:
			"T3 Code threads. They stay in T3 Code, which you can keep installed",
	}),
	msg({
		message: "Scheduled tasks and workflows. Create them again as automations",
	}),
	msg({ message: "Project settings in T3 Code, like worktree cleanup rules" }),
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
		id: "both",
		question: msg({ message: "Can I keep using T3 Code?" }),
		answer: msg({
			message:
				"Yes. Imported worktrees stay where they are, so both apps can open them. Keep worktree cleanup off in T3 Code so it does not remove them.",
		}),
		link: {
			label: msg({ message: "Migration guide" }),
			href: MIGRATE_URL,
		},
	},
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
				"Not yet. It runs on macOS and Linux. Windows users can join the waitlist from the download button.",
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
];
