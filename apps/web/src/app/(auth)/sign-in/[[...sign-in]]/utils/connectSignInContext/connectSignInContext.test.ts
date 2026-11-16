import { describe, expect, test } from "bun:test";
import { connectSignInContext } from "./connectSignInContext";

const apiUrl = "https://api.superset.sh";
const connect =
	"https://api.paradev.com/api/connectors/ahrefs_mcp/connect?organizationId=org-1&method=oauth2&plugin=ahrefs";

describe("connectSignInContext", () => {
	test("a connect link names the connector being connected", () => {
		expect(
			connectSignInContext({ redirect: connect, reason: null, apiUrl }),
		).toEqual({ connectorName: "Ahrefs", sessionExpired: false });
	});

	test("an expired session is reported apart from a missing one", () => {
		expect(
			connectSignInContext({
				redirect: connect,
				reason: "session_expired",
				apiUrl,
			}),
		).toEqual({ connectorName: "Ahrefs", sessionExpired: true });
	});

	test("ignores links that are not a known connector's connect route on our API", () => {
		for (const redirect of [
			null,
			"/dashboard",
			"not a url",
			"https://evil.test/api/connectors/ahrefs_mcp/connect",
			"https://api.paradev.com/api/connectors/not_a_connector/connect",
			"https://api.paradev.com/api/connectors/ahrefs_mcp/callback",
		])
			expect(
				connectSignInContext({ redirect, reason: "session_expired", apiUrl }),
			).toBeNull();
	});
});
