import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CatalogPlugin } from "renderer/hooks/usePluginCatalog";
import { fn } from "storybook/test";
import { PluginCard } from "./PluginCard";

function plugin(overrides: Partial<CatalogPlugin>): CatalogPlugin {
	return {
		name: "deploy-tools",
		version: "1.2.0",
		description: "Deploy and roll back services from an agent.",
		interface: {
			displayName: "Deploy Tools",
			category: "Developer tools",
		},
		mcpServers: {},
		connector: null,
		skills: ["deploy"],
		marketplace: "organization-acme",
		installed: false,
		managed: false,
		latestVersion: "1.2.0",
		updateAvailable: false,
		accounts: [],
		connections: [],
		pluginSkills: [{ name: "deploy", description: "Deploy a service." }],
		homepage: null,
		author: null,
		license: null,
		iconUrl: null,
		...overrides,
	};
}

const meta = {
	component: PluginCard,
	decorators: [
		(Story) => (
			<div className="mx-auto w-full max-w-3xl">
				<Story />
			</div>
		),
	],
	args: {
		plugin: plugin({}),
		isInstalled: false,
		isConnected: false,
		isBusy: false,
		onOpen: fn(),
		onInstall: fn(),
		onUninstall: fn(),
		onDisable: fn(),
		onUpdate: fn(),
	},
} satisfies Meta<typeof PluginCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NotInstalledList: Story = {
	render: (args) => (
		<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
			{[
				plugin({
					interface: {
						displayName: "Deploy Tools",
						category: "Developer tools",
						icon: "./assets/icon.png",
					},
					iconUrl: "/fixtures/organization-plugin-icon.png",
				}),
				plugin({
					name: "release-notes",
					description: "Draft release notes from merged pull requests.",
					interface: {
						displayName: "Release Notes",
						category: "Developer tools",
						icon: "release-notes",
					},
				}),
				plugin({
					name: "linear",
					description: "Create and update Linear issues.",
					marketplace: "superset",
					interface: {
						displayName: "Linear",
						category: "Productivity",
						icon: "linear",
					},
				}),
			].map((entry) => (
				<PluginCard key={entry.name} {...args} plugin={entry} />
			))}
		</div>
	),
};
