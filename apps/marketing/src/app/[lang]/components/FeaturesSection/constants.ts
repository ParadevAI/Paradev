import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface Feature {
	id: string;
	href?: string;
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const FEATURES: Feature[] = [
	{
		id: "agent-independence",
		title: msg({
			message: "Use the best agent. Never get locked in.",
		}),
		description: msg({
			message:
				"Use the best agents as soon as they come out. Your artifacts, branches, and plugins work across all of them.",
		}),
	},
	{
		id: "parallel-execution",
		href: "/parallel-coding-agents",
		title: msg({
			message: "Scale to 100s of agents, maintain quality bar",
		}),
		description: msg({
			message:
				"Run agents in parallel, each on its own branch. Review their work with built-in diffs, PR checks, and agent review, then merge without leaving the app.",
		}),
	},
	{
		id: "automations",
		href: "/automations",
		title: msg({
			message: "Fix bugs the moment they're filed",
		}),
		description: msg({
			message:
				"Start agents automatically: from a Sentry error, a Linear issue, a GitHub pull request, or a schedule the agent sets itself.",
		}),
	},
	{
		id: "cli-sdk",
		href: "/mcp-install",
		title: msg({
			message: "Built to be driven by agents",
		}),
		description: msg({
			message:
				"Drive the entire app and cloud from the CLI, the SDK, or over MCP.",
		}),
	},
];
