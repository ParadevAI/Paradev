import { expect, test } from "bun:test";
import {
	buildProtectedResourceMetadata,
	mcpProtectedResourceMetadataUrl,
} from "./oauth-metadata";

test.each([
	"https://api.superset.sh",
	"https://api.paradev.com",
])("MCP on %s advertises the canonical token audience", (origin) => {
	const request = new Request(`${origin}/mcp`);
	const metadata = buildProtectedResourceMetadata(request, "/mcp", {
		resourceUrl: "https://api.superset.sh/mcp",
		authorizationServerUrl: `${origin}/api/auth`,
	});
	expect(metadata.resource).toBe("https://api.superset.sh/mcp");
	expect(metadata.authorization_servers).toEqual([`${origin}/api/auth`]);
	expect(mcpProtectedResourceMetadataUrl(request)).toBe(
		`${origin}/.well-known/oauth-protected-resource/mcp`,
	);
});

test.each([
	"/",
	"/mcp",
	"/mcp/plugins/marketplace/plugin",
])("discovery for %s keeps the canonical resource even behind a forwarded host", (path) => {
	const request = new Request(`https://internal.test${path}`, {
		headers: {
			"x-forwarded-host": "api.paradev.com",
			"x-forwarded-proto": "https",
		},
	});
	expect(
		buildProtectedResourceMetadata(request, path, {
			resourceUrl: "https://api.superset.sh/mcp",
		}).resource,
	).toBe("https://api.superset.sh/mcp");
	expect(mcpProtectedResourceMetadataUrl(request)).toBe(
		"https://api.paradev.com/.well-known/oauth-protected-resource/mcp",
	);
});
