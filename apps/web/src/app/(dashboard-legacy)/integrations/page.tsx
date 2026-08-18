"use client";

import { BsMicrosoftTeams } from "react-icons/bs";
import { FaGithub, FaGoogle, FaSlack } from "react-icons/fa";
import { SiLinear, SiNotion, SiSentry } from "react-icons/si";
import {
	IntegrationCard,
	type IntegrationCardProps,
} from "./components/IntegrationCard";

const integrations: IntegrationCardProps[] = [
	{
		id: "linear",
		name: "Linear",
		description: "Sync issues bidirectionally with Linear.",
		category: "Task Management",
		accentColor: "#5E6AD2",
		icon: <SiLinear className="size-8" />,
	},
	{
		id: "github",
		name: "GitHub",
		description: "Connect repos and sync pull requests.",
		category: "Version Control",
		accentColor: "#238636",
		icon: <FaGithub className="size-8" />,
	},
	{
		id: "slack",
		name: "Slack",
		description: "Connect Slack to manage tasks from conversations.",
		category: "Communication",
		accentColor: "#4A154B",
		icon: <FaSlack className="size-8" />,
	},
	{
		id: "notion",
		name: "Notion",
		description: "Run automations on data source and comment activity.",
		category: "Knowledge",
		accentColor: "#5F5E5B",
		icon: <SiNotion className="size-8" />,
	},
	{
		id: "microsoft-teams",
		name: "Microsoft Teams",
		description: "Trigger automations from Teams channel messages.",
		category: "Communication",
		accentColor: "#5B5FC7",
		icon: <BsMicrosoftTeams className="size-8" />,
	},
	{
		id: "sentry",
		name: "Sentry",
		description: "Run automations when Sentry issues change.",
		category: "Monitoring",
		accentColor: "#362D59",
		icon: <SiSentry className="size-8" />,
	},
	{
		id: "google",
		name: "Google",
		description: "Trigger automations from Google Calendar and Gmail.",
		category: "Productivity",
		accentColor: "#4285F4",
		icon: <FaGoogle className="size-8" />,
	},
];

export default function IntegrationsPage() {
	return (
		<div className="space-y-8">
			<section>
				<h2 className="text-xl font-semibold">Featured</h2>
				<p className="text-muted-foreground">
					A selection of integrations curated by our team.
				</p>

				<div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
					{integrations.map((integration) => (
						<IntegrationCard key={integration.id} {...integration} />
					))}
				</div>
			</section>
		</div>
	);
}
