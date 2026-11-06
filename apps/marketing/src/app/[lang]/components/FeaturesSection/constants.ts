import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface Feature {
	id: string;
	tag: MessageDescriptor;
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const FEATURES: Feature[] = [
	{
		id: "agent-independence",
		tag: msg({
			message: "Agent Independence",
		}),
		title: msg({
			message: "Switch agents. Keep your workflow",
		}),
		description: msg({
			message:
				"Use Claude Code, Codex, OpenCode, or any CLI agent. Your workspaces, branches, and review stay the same.",
		}),
	},
	{
		id: "parallel-execution",
		tag: msg({
			message: "Parallel Execution",
		}),
		title: msg({
			message: "Scale to 100+ agents",
		}),
		description: msg({
			message:
				"Run parallel coding agents on features, fixes, and refactors. Each one works on its own branch, locally or in the cloud.",
		}),
	},
	{
		id: "automations",
		tag: msg({
			message: "Automations",
		}),
		title: msg({
			message: "Start agents on events or a schedule",
		}),
		description: msg({
			message:
				"Agents triage issues, draft changelogs, and bump dependencies on their own. You review the PRs.",
		}),
	},
	{
		id: "cli-sdk",
		tag: msg({
			message: "CLI & SDK",
		}),
		title: msg({
			message: "Drive it from the terminal",
		}),
		description: msg({
			message:
				"Create workspaces and start agents from the CLI, the SDK, or over MCP.",
		}),
	},
];
