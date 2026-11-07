import { afterEach, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { PluginIcon } from "renderer/components/PluginIcon";
import type { CatalogPlugin } from "renderer/hooks/usePluginCatalog";
import { PluginCard } from "./PluginCard";

afterEach(cleanup);

const noop = () => {};

function iconMarkup(plugin: CatalogPlugin): string | undefined {
	const { container } = render(
		<PluginCard
			plugin={plugin}
			isInstalled={false}
			isConnected={false}
			isBusy={false}
			onOpen={noop}
			onInstall={noop}
			onUninstall={noop}
			onDisable={noop}
			onUpdate={noop}
		/>,
	);
	return container.querySelector("svg")?.outerHTML;
}

function markupOf(element: React.ReactElement): string | undefined {
	return render(element).container.querySelector("svg")?.outerHTML;
}

const acme: CatalogPlugin = {
	name: "acme",
	version: "1.0.0",
	description: "",
	interface: { displayName: "Acme", category: "Developer tools" },
	icon: "linear",
	mcpServers: {},
	skills: [],
	connector: null,
	marketplace: "acme-marketplace",
	installed: false,
	managed: false,
	latestVersion: null,
	updateAvailable: false,
	accounts: [],
	connections: [],
	pluginSkills: [],
	homepage: null,
	author: null,
	license: null,
};

test("a plugin whose manifest names an icon renders that icon, not the puzzle", () => {
	const rendered = iconMarkup(acme);
	expect(rendered).toBe(markupOf(<PluginIcon pluginName="linear" />));
	expect(rendered).not.toBe(markupOf(<PluginIcon pluginName="acme" />));
});

test("an icon value that is not a built-in key never hides the plugin's own icon", () => {
	const linear = { ...acme, name: "linear", icon: "./artwork.svg" };
	expect(iconMarkup(linear)).toBe(markupOf(<PluginIcon pluginName="linear" />));
});
