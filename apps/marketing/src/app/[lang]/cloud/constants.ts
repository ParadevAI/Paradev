import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

interface CloudFeature {
	title: MessageDescriptor;
	description: MessageDescriptor;
}

export const CLOUD_FEATURES: CloudFeature[] = [
	{
		title: msg({ message: "Close your laptop" }),
		description: msg({
			message:
				"Agents keep working in the cloud. Open the workspace again from desktop, iPhone, or iPad.",
		}),
	},
	{
		title: msg({ message: "Set up once" }),
		description: msg({
			message:
				"An environment holds your repositories, variables, and region. Start as many workspaces from it as you need.",
		}),
	},
	{
		title: msg({ message: "Pick a machine size" }),
		description: msg({
			message:
				"Small, Medium, or Large, up to 8 vCPU and 16 GB. Usage scales with memory.",
		}),
	},
	{
		title: msg({ message: "No keys in the sandbox" }),
		description: msg({
			message:
				"Agents see a placeholder. Paradev adds your sign-in to outgoing requests.",
		}),
	},
];
