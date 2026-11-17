import { describe, expect, it } from "bun:test";
import { parseWorkspaceLinkUrl } from "./parseWorkspaceLinkUrl";

const WEB_URL = "https://app.superset.sh";
const OPTIONS = { protocolScheme: "superset", webUrl: WEB_URL };
const WORKSPACE_ID = "eb417a4d-96f9-4f29-89ad-5cefe15e869a";

describe("parseWorkspaceLinkUrl", () => {
	it.each([
		`superset://v2-workspace/${WORKSPACE_ID}`,
		`superset://v2-workspace/${WORKSPACE_ID}/`,
		`superset://v2-workspace/${WORKSPACE_ID}?sessionId=abc#top`,
		`${WEB_URL}/workspaces/${WORKSPACE_ID}`,
		`${WEB_URL}/workspaces/${WORKSPACE_ID}/`,
		`${WEB_URL}/workspaces/${WORKSPACE_ID}?sessionId=abc#top`,
		`https://app.paradev.com/workspaces/${WORKSPACE_ID}`,
	])("extracts the workspace id from %s", (url) => {
		expect(parseWorkspaceLinkUrl(url, OPTIONS)).toBe(WORKSPACE_ID);
	});

	it("uses the app's own protocol scheme", () => {
		expect(
			parseWorkspaceLinkUrl(
				`superset-my-branch://v2-workspace/${WORKSPACE_ID}`,
				{
					protocolScheme: "superset-my-branch",
					webUrl: WEB_URL,
				},
			),
		).toBe(WORKSPACE_ID);
	});

	it("tolerates a trailing slash on the configured web URL", () => {
		expect(
			parseWorkspaceLinkUrl(`${WEB_URL}/workspaces/${WORKSPACE_ID}`, {
				protocolScheme: "superset",
				webUrl: `${WEB_URL}/`,
			}),
		).toBe(WORKSPACE_ID);
	});

	it("decodes a percent-encoded id", () => {
		expect(
			parseWorkspaceLinkUrl("superset://v2-workspace/a%20b", OPTIONS),
		).toBe("a b");
	});

	it.each([
		["another app scheme", `superset-dev://v2-workspace/${WORKSPACE_ID}`],
		["another deep link", `superset://tasks/${WORKSPACE_ID}`],
		["a deep link with no id", "superset://v2-workspace"],
		["a deep link with an empty id", "superset://v2-workspace/"],
		["a nested deep link", `superset://v2-workspace/${WORKSPACE_ID}/files`],
		["another web page", `${WEB_URL}/tasks/${WORKSPACE_ID}`],
		["a web workspace with no id", `${WEB_URL}/workspaces/`],
		["a nested web path", `${WEB_URL}/workspaces/${WORKSPACE_ID}/settings`],
		["an empty path segment", `${WEB_URL}/workspaces//${WORKSPACE_ID}`],
		["another origin", `https://evil.example.com/workspaces/${WORKSPACE_ID}`],
		[
			"http on the web host",
			`http://app.superset.sh/workspaces/${WORKSPACE_ID}`,
		],
		["a file URL", `file:///workspaces/${WORKSPACE_ID}`],
		["text that is not a URL", "not a url"],
		["an empty string", ""],
	])("returns null for %s", (_case, url) => {
		expect(parseWorkspaceLinkUrl(url, OPTIONS)).toBeNull();
	});
});
