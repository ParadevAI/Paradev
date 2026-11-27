import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CANONICAL_URLS } from "@superset/shared/constants";
import { renderBoard } from "./render-board";

export const WORKSPACE_BOARD_URI = "ui://paradev/workspace-board/v1";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";
const MCP_APPS_PROTOCOL_VERSION = "2026-01-26";

const STYLE = `
:root{color-scheme:light dark;--bg:var(--color-background-primary,light-dark(#fff,#171717));--fg:var(--color-text-primary,light-dark(#171717,#fafafa));--muted:var(--color-text-secondary,light-dark(#6b6b6b,#a3a3a3));--line:var(--color-border-primary,light-dark(#e5e5e5,#2e2e2e));--success:var(--color-text-success,light-dark(#15803d,#4ade80));--info:var(--color-text-info,light-dark(#1d4ed8,#93c5fd));--danger:var(--color-text-danger,light-dark(#b91c1c,#f87171));font-family:var(--font-sans,system-ui,sans-serif)}
:root[data-theme=light]{color-scheme:light}:root[data-theme=dark]{color-scheme:dark}
*{box-sizing:border-box}body{margin:0;padding:12px;background:var(--bg);color:var(--fg);font-size:14px;line-height:1.4}
.group+.group{margin-top:12px}summary{display:flex;align-items:baseline;gap:8px;cursor:pointer;padding:4px 0;list-style:none}summary::-webkit-details-marker{display:none}
.project{font-weight:600}.host,.count,.branch{color:var(--muted);font-size:12px}.count{margin-left:auto}
.host,.branch{font-family:var(--font-mono,ui-monospace,monospace);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
ul{list-style:none;margin:0;padding:0;border-top:1px solid var(--line)}.row{display:flex;align-items:baseline;gap:8px;padding:8px 0;border-bottom:1px solid var(--line)}
.name{font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}.status{margin-left:auto;font-size:12px;color:var(--muted)}
.status[data-tone=success]{color:var(--success)}.status[data-tone=info]{color:var(--info)}.status[data-tone=danger]{color:var(--danger)}
.empty{color:var(--muted);margin:0}`;

const BRIDGE = `
const board = document.getElementById("board");
let nextId = 1;
const post = (message) => window.parent.postMessage({ jsonrpc: "2.0", ...message }, "*");
const applyContext = (context) => {
	if (!context) return;
	if (context.theme) document.documentElement.dataset.theme = context.theme;
	const variables = context.styles && context.styles.variables;
	if (variables) for (const [name, value] of Object.entries(variables)) {
		if (value) document.documentElement.style.setProperty(name, value);
	}
};
const reportSize = () => post({ method: "ui/notifications/size-changed", params: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight } });
new ResizeObserver(reportSize).observe(document.body);
const initializeId = nextId++;
window.addEventListener("message", (event) => {
	if (event.source !== window.parent) return;
	const message = event.data;
	if (!message || message.jsonrpc !== "2.0") return;
	if (message.id === initializeId && message.result) {
		applyContext(message.result.hostContext);
		post({ method: "ui/notifications/initialized" });
	} else if (message.method === "ui/notifications/tool-result") {
		board.innerHTML = renderBoard(message.params && message.params.structuredContent);
	} else if (message.method === "ui/notifications/host-context-changed") {
		applyContext(message.params);
	}
});
post({ id: initializeId, method: "ui/initialize", params: { appInfo: { name: "paradev-workspace-board", version: "1" }, appCapabilities: { availableDisplayModes: ["inline"] }, protocolVersion: "${MCP_APPS_PROTOCOL_VERSION}" } });`;

export const WORKSPACE_BOARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${STYLE}</style>
</head>
<body>
<main id="board"></main>
<script>
const renderBoard = ${renderBoard.toString()};
${BRIDGE}
</script>
</body>
</html>`;

export function registerWorkspaceBoard(server: McpServer): void {
	server.registerResource(
		"workspace-board",
		WORKSPACE_BOARD_URI,
		{
			title: "Workspace board",
			description:
				"Read-only board of the workspaces returned by workspaces_list, grouped by host and project.",
			mimeType: MCP_APP_MIME_TYPE,
		},
		async () => ({
			contents: [
				{
					uri: WORKSPACE_BOARD_URI,
					mimeType: MCP_APP_MIME_TYPE,
					text: WORKSPACE_BOARD_HTML,
					_meta: {
						ui: {
							prefersBorder: true,
							csp: { connectDomains: [], resourceDomains: [] },
						},
						"openai/widgetDomain": CANONICAL_URLS.MARKETING,
					},
				},
			],
		}),
	);
}
