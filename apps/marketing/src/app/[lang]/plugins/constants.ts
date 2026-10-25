import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export type StepId = "install" | "connect" | "mention" | "run";

interface PluginsItem {
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export interface CatalogPlugin {
	name: string;
	displayName: string;
	description: MessageDescriptor;
	installed?: boolean;
}

export const AGENT_TARGETS: { name: string; icon: string }[] = [
	{ name: "Claude Code", icon: "/app-icons/claude.svg" },
	{ name: "Codex", icon: "/app-icons/codex.svg" },
	{ name: "Cursor Agent", icon: "/app-icons/cursor-agent.svg" },
	{ name: "OpenCode", icon: "/app-icons/opencode.svg" },
	{ name: "Gemini CLI", icon: "/app-icons/gemini.svg" },
	{ name: "Mistral Vibe", icon: "/app-icons/vibe.svg" },
	{ name: "Kimi Code", icon: "/app-icons/kimi.svg" },
];

export const CATALOG: {
	category: MessageDescriptor;
	plugins: CatalogPlugin[];
}[] = [
	{
		category: msg({ message: "Productivity" }),
		plugins: [
			{
				name: "linear",
				displayName: "Linear",
				description: msg({ message: "File and update issues" }),
				installed: true,
			},
			{
				name: "notion",
				displayName: "Notion",
				description: msg({ message: "Search and write pages" }),
			},
			{
				name: "google-calendar",
				displayName: "Google Calendar",
				description: msg({ message: "Schedule meetings" }),
			},
			{
				name: "granola",
				displayName: "Granola",
				description: msg({ message: "Search your meeting notes" }),
			},
			{
				name: "circleback",
				displayName: "Circleback",
				description: msg({ message: "Work the action items from a call" }),
			},
			{
				name: "ynab",
				displayName: "YNAB",
				description: msg({ message: "Track budgets and spending" }),
			},
		],
	},
	{
		category: msg({ message: "Communication" }),
		plugins: [
			{
				name: "slack",
				displayName: "Slack",
				description: msg({ message: "Search and post in channels" }),
				installed: true,
			},
			{
				name: "gmail",
				displayName: "Gmail",
				description: msg({ message: "Read and send mail" }),
			},
			{
				name: "superhuman",
				displayName: "Superhuman",
				description: msg({ message: "Triage mail and draft replies" }),
			},
		],
	},
	{
		category: msg({ message: "Developer tools" }),
		plugins: [
			{
				name: "github",
				displayName: "GitHub",
				description: msg({ message: "Triage issues and failing CI" }),
				installed: true,
			},
			{
				name: "sentry",
				displayName: "Sentry",
				description: msg({ message: "Debug with production stack traces" }),
				installed: true,
			},
			{
				name: "vercel",
				displayName: "Vercel",
				description: msg({ message: "Read deployment and build logs" }),
			},
		],
	},
	{
		category: msg({ message: "Data & APIs" }),
		plugins: [
			{
				name: "neon",
				displayName: "Neon",
				description: msg({ message: "Inspect branches and run SQL" }),
			},
			{
				name: "posthog",
				displayName: "PostHog",
				description: msg({ message: "Query events and feature flags" }),
			},
			{
				name: "stripe",
				displayName: "Stripe",
				description: msg({ message: "Trace charges and subscriptions" }),
			},
			{
				name: "autumn",
				displayName: "Autumn",
				description: msg({ message: "Check plans and balances" }),
			},
			{
				name: "exa",
				displayName: "Exa",
				description: msg({ message: "Search the web" }),
			},
		],
	},
];

export const STEPS: (PluginsItem & { id: StepId })[] = [
	{
		id: "install",
		title: msg({ message: "Install." }),
		description: msg({
			message: "Pick one in the Superset app. It's saved to your account.",
		}),
	},
	{
		id: "connect",
		title: msg({ message: "Connect." }),
		description: msg({
			message: "Sign in once. Superset keeps the connection.",
		}),
	},
	{
		id: "mention",
		title: msg({ message: "Mention." }),
		description: msg({
			message: "Type @linear in any prompt.",
		}),
	},
	{
		id: "run",
		title: msg({ message: "Run." }),
		description: msg({
			message:
				"The agent uses its skills and tools. The issue lands in Linear.",
		}),
	},
];

export const FEATURES: PluginsItem[] = [
	{
		title: msg({ message: "Works in every agent" }),
		description: msg({
			message:
				"Claude Code, Codex, Cursor, OpenCode and more. No setup per agent.",
		}),
	},
	{
		title: msg({ message: "Tokens stay off your machine" }),
		description: msg({
			message:
				"Superset holds the token and makes the calls. Agents never see it.",
		}),
	},
	{
		title: msg({ message: "Local and cloud" }),
		description: msg({
			message:
				"Ready on every machine you sign into and in every cloud workspace.",
		}),
	},
	{
		title: msg({ message: "Publish from your own repo" }),
		description: msg({
			message: "Share plugins from a GitHub repo. Pin releases with git tags.",
		}),
	},
];
