import { expect, test } from "bun:test";
import { type CatalogRow, toCatalogPlugin } from "./toCatalogPlugin";

const row: CatalogRow = {
	name: "acme",
	version: "1.0.0",
	description: "",
	marketplace: "acme-marketplace",
	displayName: "Acme",
	category: "Developer tools",
	icon: "linear",
	connector: null,
	mcpUrl: null,
	skills: [],
	homepage: null,
	author: null,
	license: null,
	installed: false,
	installedAt: null,
	enabled: false,
	latestVersion: null,
	managed: false,
	connections: [],
	accounts: [],
};

test("a catalog row keeps the icon its manifest names", () => {
	expect(toCatalogPlugin(row, undefined).icon).toBe("linear");
});
