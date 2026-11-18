import { describe, expect, test } from "bun:test";
import { CONNECTOR_SLUGS } from "@superset/shared/connectors";
import { connectorCatalog } from "./catalog";

describe("connectorCatalog", () => {
	test("lists every connector that is not hidden, and no other", () => {
		const slugs = connectorCatalog().map((entry) => entry.slug);
		expect(slugs).not.toContain("superset_admin_mcp");
		expect(slugs).toEqual(
			CONNECTOR_SLUGS.filter((slug) => slug !== "superset_admin_mcp"),
		);
	});

	test("an entry keeps the shape released clients read", () => {
		const entry = connectorCatalog().find((item) => item.slug === "linear_mcp");
		expect(Object.keys(entry ?? {}).sort()).toEqual([
			"category",
			"displayName",
			"icon",
			"methods",
			"scope",
			"slug",
		]);
	});
});
