import { describe, expect, it } from "bun:test";
import { githubAppSettingsUrl } from "./githubAppSettingsUrl";

describe("githubAppSettingsUrl", () => {
	it("points an organization installation at the organization's settings", () => {
		expect(
			githubAppSettingsUrl({
				installationId: "42",
				accountLogin: "superset-sh",
				accountType: "Organization",
			}),
		).toBe(
			"https://github.com/organizations/superset-sh/settings/installations/42",
		);
	});

	it("points a personal installation at the user's settings", () => {
		expect(
			githubAppSettingsUrl({
				installationId: "7",
				accountLogin: "someone",
				accountType: "User",
			}),
		).toBe("https://github.com/settings/installations/7");
	});
});
