import { describe, expect, test } from "bun:test";
import { apiUrlFromRedirect } from "./apiUrlFromRedirect";

const apiUrl = "https://api.superset.sh";

describe("apiUrlFromRedirect", () => {
	test("accepts our API and its twin on the other root domain", () => {
		for (const redirect of [
			"https://api.superset.sh/api/github/install?organizationId=org-1",
			"https://api.paradev.com/api/connectors/ahrefs_mcp/connect",
		])
			expect(apiUrlFromRedirect({ redirect, apiUrl })?.href).toBe(redirect);
	});

	test("rejects anything else", () => {
		for (const redirect of [
			null,
			"/dashboard",
			"not a url",
			"https://evil.test/api/github/install",
			"https://api.superset.sh.evil.test/api/github/install",
		])
			expect(apiUrlFromRedirect({ redirect, apiUrl })).toBeNull();
	});
});
