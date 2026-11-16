import { describe, expect, test } from "bun:test";
import { connectorNameFromRedirect } from "./connectorNameFromRedirect";

const apiUrl = "https://api.superset.sh";

describe("connectorNameFromRedirect", () => {
	test("a connect link on our API names the connector being connected", () => {
		expect(
			connectorNameFromRedirect({
				redirect:
					"https://api.paradev.com/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs",
				apiUrl,
			}),
		).toBe("Ahrefs");
	});

	test("ignores links that are not a known connector's connect route on our API", () => {
		for (const redirect of [
			null,
			"/dashboard",
			"not a url",
			"https://evil.test/api/connectors/ahrefs_mcp/connect",
			"https://api.paradev.com/api/connectors/not_a_connector/connect",
			"https://api.paradev.com/api/connectors/constructor/connect",
			"https://api.paradev.com/api/connectors/ahrefs_mcp/callback",
			"https://api.paradev.com/api/tasks/task-1/files/file-1",
		])
			expect(connectorNameFromRedirect({ redirect, apiUrl })).toBeNull();
	});
});
