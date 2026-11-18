import { describe, expect, test } from "bun:test";
import { getConnector } from "./index";

describe("getConnector", () => {
	test("finds a registered connector", () => {
		expect(getConnector("ahrefs_mcp")?.displayName).toBe("Ahrefs");
	});

	test("does not match inherited object keys", () => {
		for (const slug of ["constructor", "__proto__", "toString"])
			expect(getConnector(slug)).toBeUndefined();
	});
});

import { CONNECTOR_SLUGS, CONNECTORS, PUBLIC_CONNECTOR_SLUGS } from "./index";

describe("the admin connector", () => {
	const method = getConnector("superset_admin_mcp")?.methods[0];

	test("is hidden, and no other connector is", () => {
		for (const slug of CONNECTOR_SLUGS)
			expect(CONNECTORS[slug]?.hidden).toBe(slug === "superset_admin_mcp");
	});

	test("is left out of the public list but still a known slug", () => {
		expect(CONNECTOR_SLUGS).toContain("superset_admin_mcp");
		expect(PUBLIC_CONNECTOR_SLUGS).not.toContain("superset_admin_mcp");
		expect(PUBLIC_CONNECTOR_SLUGS.length).toBe(CONNECTOR_SLUGS.length - 1);
	});

	test("takes its address from the environment, naming no host", () => {
		expect(method?.type).toBe("oauth2");
		if (method?.type !== "oauth2") return;
		expect(method.authorization_url).toBe(
			// biome-ignore lint/suspicious/noTemplateCurlyInString: a registry template, not a JS template
			"${env.NEXT_PUBLIC_ADMIN_URL}/api/mcp/cloud",
		);
		expect(method.requires_env).toContain("NEXT_PUBLIC_ADMIN_URL");
		expect(JSON.stringify(getConnector("superset_admin_mcp"))).not.toMatch(
			/https?:\/\/(?!\$\{)/,
		);
	});

	test("caps the stored token life and names its resource on refresh", () => {
		if (method?.type !== "oauth2") throw new Error("not oauth2");
		expect(method.token_max_age).toBe(3000);
		expect(method.resource_on_refresh).toBe(true);
	});

	test("no other connector caps a token or sends a resource on refresh", () => {
		for (const [slug, connector] of Object.entries(CONNECTORS)) {
			if (slug === "superset_admin_mcp") continue;
			for (const entry of connector.methods) {
				if (entry.type !== "oauth2") continue;
				expect(entry.token_max_age).toBeUndefined();
				expect(entry.resource_on_refresh).toBe(false);
			}
		}
	});
});
