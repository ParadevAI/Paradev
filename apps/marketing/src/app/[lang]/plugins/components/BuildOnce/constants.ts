export const MANIFEST_FILES = [
	{ path: "acme-deploy/", depth: 0 },
	{ path: "plugin.json", depth: 1 },
	{ path: "skills/", depth: 1 },
	{ path: "ship-release/SKILL.md", depth: 2 },
	{ path: "roll-back/SKILL.md", depth: 2 },
];

export const MANIFEST_JSON = `{
  "name": "acme-deploy",
  "version": "1.0.0",
  "extensions": {
    "superset": {
      "connector": { "slug": "acme" },
      "mcp": {
        "type": "streamable-http",
        "url": "https://mcp.acme.dev/mcp"
      }
    }
  }
}`;
