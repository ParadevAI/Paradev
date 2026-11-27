import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { COMPANY } from "@superset/shared/constants";

export const MIGRATE_URL = `${COMPANY.DOCS_URL}/migrate-from-orca`;
export const COMPARE_PATH = "/compare/superset-vs-orca";

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
		title: msg({ message: "Chat or terminal" }),
		detail: msg({
			message:
				"Agents open as a chat or as their CLI in a terminal. Switch the same session between the two at any time.",
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
		title: msg({ message: "CLI, SDK and MCP" }),
		detail: msg({
			message:
				"Control workspaces and agents from scripts with the CLI, the TypeScript SDK, or the MCP server.",
		}),
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
				"{companyName} finds your Orca worktrees and imports them in place, with uncommitted changes.",
		}),
		link: {
			label: msg({ message: "Migration guide" }),
			href: MIGRATE_URL,
		},
	},
	{
		title: msg({ message: "Convert your scripts" }),
		detail: msg({
			message:
				"Move the scripts in orca.yaml to .paradev/config.json, or ask an agent to do it for you.",
		}),
		link: {
			label: msg({ message: "Convert your scripts" }),
			href: `${MIGRATE_URL}#3-convert-your-scripts`,
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
	orca: MessageDescriptor;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
	{
		id: "worktrees",
		label: msg({ message: "Worktree per task" }),
		paradev: msg({ message: "Yes" }),
		orca: msg({ message: "Yes" }),
	},
	{
		id: "interface",
		label: msg({ message: "How you work" }),
		paradev: msg({
			message: "Chat, or the agent's own CLI in a terminal",
		}),
		orca: msg({ message: "Chat UI or terminal for each agent" }),
	},
	{
		id: "agents",
		label: msg({ message: "Agents" }),
		paradev: msg({
			message:
				"Claude Code, Codex, Cursor Agent, OpenCode, Gemini, Amp, any CLI",
		}),
		orca: msg({ message: "More than 25 named agents" }),
	},
	{
		id: "cloud",
		label: msg({ message: "Cloud workspaces" }),
		paradev: msg({ message: "Paid plans" }),
		orca: msg({ message: "Experimental cloud VMs on your own provider" }),
	},
	{
		id: "automations",
		label: msg({ message: "Automations" }),
		paradev: msg({ message: "Local, on a host, or in the cloud" }),
		orca: msg({ message: "Scheduled automations" }),
	},
	{
		id: "phone",
		label: msg({ message: "Phone" }),
		paradev: msg({ message: "iPhone, iPad, and Android" }),
		orca: msg({ message: "iOS app and an Android APK, both in beta" }),
	},
	{
		id: "platforms",
		label: msg({ message: "Platforms" }),
		paradev: msg({ message: "macOS, Linux" }),
		orca: msg({ message: "macOS, Windows, Linux" }),
	},
	{
		id: "programmatic",
		label: msg({ message: "Programmatic control" }),
		paradev: msg({ message: "CLI, TypeScript SDK, and MCP server" }),
		orca: msg({ message: "CLI" }),
	},
	{
		id: "license",
		label: msg({ message: "License" }),
		paradev: msg({ message: "Open source (MIT)" }),
		orca: msg({ message: "Open source (MIT)" }),
	},
	{
		id: "price",
		label: msg({ message: "Price" }),
		paradev: msg({
			message: "Free for one user. Pro from {proPrice}/user/mo",
		}),
		unpricedParadev: msg({ message: "Free for one user. Paid plans per user" }),
		orca: msg({ message: "Free" }),
	},
];

export const TRANSFERS: MessageDescriptor[] = [
	msg({ message: "Repos, worktrees and branches" }),
	msg({ message: "Uncommitted changes" }),
	msg({ message: "Your agent subscriptions and keys" }),
	msg({ message: "Setup scripts, once you convert orca.yaml" }),
];

export const DOES_NOT_TRANSFER: MessageDescriptor[] = [
	msg({
		message: "Workspace details in Orca, like pins, comments and linked issues",
	}),
	msg({ message: "Automations. Create them again in {companyName}" }),
	msg({
		message: "Managed agent accounts in Orca. Sign in to each agent again",
	}),
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
		question: msg({ message: "Can I keep using Orca?" }),
		answer: msg({
			message:
				"Yes. Imported worktrees stay where they are, so both apps can open them. Do not delete an imported workspace in Orca, because that removes its folder.",
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
