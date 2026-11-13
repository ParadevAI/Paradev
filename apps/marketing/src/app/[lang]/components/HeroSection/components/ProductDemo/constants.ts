import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ActiveDemo } from "../AppMockup";

export interface DemoOption {
	id: ActiveDemo;
	label: MessageDescriptor;
}

export const DEMO_OPTIONS: readonly DemoOption[] = [
	{
		id: "Cloud Workspaces",
		label: msg({
			message: "Cloud Workspaces",
		}),
	},
	{
		id: "Orchestrate Parallel Agents",
		label: msg({
			message: "Orchestrate Parallel Agents",
		}),
	},
	{
		id: "Automate Tasks",
		label: msg({
			message: "Automate Tasks",
		}),
	},
	{
		id: "Publish Pages",
		label: msg({
			message: "Publish Pages",
		}),
	},
] as const;
