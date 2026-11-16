import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	createMcpExtension,
	type ExtensionAPI,
	type LoadedMcpConfig,
	type McpServerEntry,
	type McpTransportFactory,
} from "@earendil-works/pi-coding-agent";
import { StreamableHttpTransport } from "@earendil-works/pi-mcp";

/**
 * A connected app the Dev's owner gave it (`composio-<toolkit>`, or `dev-<app>` for Dev's own apps), as the server sends it with every turn, with the
 * accounts it acts as there.
 */
export interface TurnPlugin {
	name: string;
	displayName: string;
	description: string;
	/** The accounts its tools act as (`me@x.com`; with several, `me@x.com (ca_1)`, the id saying which to pass). */
	accounts?: string[];
}

/** How long a turn waits for a new or changed server's tools, like pi's own wait for servers at startup. */
const CONNECT_WAIT_MS = 10_000;

/** The chat a box's request to the API is for; not a secret (the box's proxy adds the credential). */
const CHAT_HEADER = "x-dev-chat";

/** pi's namespace for a server's tools: `mcp__<namespace>__<tool>`. */
const namespace = (name: string) => name.replace(/[^A-Za-z0-9_]/g, "_");

/** Fills `${VAR}` in a header from the box's env (the server passes MCP secrets that way, never in the file). */
function resolveEnv(value: string, server: string) {
	return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
		const resolved = process.env[name];
		if (resolved === undefined)
			throw new Error(`MCP server "${server}": ${name} is not set`);
		return resolved;
	});
}

/** The servers in `/agent/mcp.json` (written by the server; remote servers only). */
function fileServers(path: string): LoadedMcpConfig {
	if (!existsSync(path)) return { servers: [], errors: [] };
	try {
		const parsed = JSON.parse(readFileSync(path, "utf8")) as {
			mcpServers?: Record<string, McpServerEntry["config"]>;
		};
		return {
			servers: Object.entries(parsed.mcpServers ?? {}).map(
				([name, config]) => ({
					name,
					config,
					source: path,
					scope: "global" as const,
				}),
			),
			errors: [],
		};
	} catch (err) {
		return { servers: [], errors: [`${path}: ${(err as Error).message}`] };
	}
}

/**
 * The Dev's connected apps, for the system prompt: what each is and the accounts it acts as, so the model can tell
 * several of one app apart and say which it means.
 */
export function pluginsPrompt(plugins: TurnPlugin[]) {
	if (!plugins.length) return [];
	const lines = plugins.flatMap((p) => {
		const accounts = p.accounts?.length
			? [`  - Connected accounts: ${p.accounts.join(", ")}`]
			: [];
		return [
			`- ${p.displayName} (\`${p.name}\`, tools \`mcp__${namespace(p.name)}__*\`): ${p.description}`,
			...accounts,
		];
	});
	return [`## Your connected apps\n\n${lines.join("\n")}`];
}

/** Whether one of a server's tools is offered to the model (pi hides, rather than removes, a dropped server's tools). */
const offered = (pi: ExtensionAPI, name: string) =>
	pi
		.getAllTools()
		.some(
			(tool) =>
				tool.name.startsWith(`mcp__${namespace(name)}__`) &&
				tool.exposure !== "hidden",
		);

/**
 * The MCP side of a pi session: the servers in `/agent/mcp.json`, which the server writes (one entry per connected app
 * its owner gave it, `composio-<toolkit>` at the API's credential proxy `<api>/integrations/composio/<toolkit>/mcp` or
 * `dev-<app>` at the API's own tools `<api>/integrations/apps/<app>/mcp`, then
 * the MCP servers its owner added). pi reads its `mcp.json` only when a session starts, so the file's servers are
 * registered here instead and synced at the start of every turn: a pick, an unpick or a changed account or server takes
 * effect on the Dev's next turn, without reloading the session. A group's Dev never gets any app.
 *
 * Requests to the API name the session's chat (`x-dev-chat`); the box's network proxy adds the box's credential, so
 * no token or credential for the app is ever in the box. The proxy checks the Dev is in that chat and was given the
 * app.
 */
export function createSessionMcp(opts: {
	agentDir: string;
	apiUrl: string;
	chatId: string;
}) {
	let plugins: TurnPlugin[] = [];
	let pi: ExtensionAPI | null = null;
	/** What each registered server was registered with, to tell a changed entry from an unchanged one. */
	const registered = new Map<string, string>();
	const api = `${opts.apiUrl.replace(/\/+$/, "")}/`;
	const configPath = join(opts.agentDir, "mcp.json");

	const createTransport: McpTransportFactory = (entry, _cwd, authProvider) => {
		if (!("url" in entry.config))
			throw new Error(
				`MCP server "${entry.name}": only remote servers run in a Dev's box`,
			);
		const headers = Object.fromEntries(
			Object.entries(entry.config.headers ?? {}).map(([k, v]) => [
				k,
				resolveEnv(v, entry.name),
			]),
		);
		if (entry.config.url.startsWith(api)) headers[CHAT_HEADER] = opts.chatId;
		return new StreamableHttpTransport({
			url: entry.config.url,
			headers,
			authProvider,
		});
	};

	/** Waits, a bounded time, until each server's tools are offered (or not), like pi's own wait for servers at startup. */
	async function until(names: string[], wanted: boolean) {
		const deadline = Date.now() + CONNECT_WAIT_MS;
		while (
			names.some((name) => offered(pi!, name) !== wanted) &&
			Date.now() < deadline
		)
			await new Promise((r) => setTimeout(r, 50));
	}

	return {
		extensions: [
			// The file's servers come in through `sync`, not pi's own loading, which would read them once.
			createMcpExtension({
				logPath: join(opts.agentDir, ".pi", "mcp.log"),
				loadConfig: () => ({ servers: [], errors: [] }),
				createTransport,
			}),
			(extension: ExtensionAPI) => {
				pi = extension;
			},
		],
		plugins: () => plugins,
		/**
		 * At the start of a turn: syncs pi's servers with `mcp.json`. A new or changed
		 * server is (re)connected before the turn's first request, so it declares the server's current tools (and, with
		 * several accounts, their account argument).
		 */
		async startTurn(next: TurnPlugin[]) {
			if (!pi) throw new Error("the session's extensions aren't bound yet");
			plugins = next;
			const { servers, errors } = fileServers(configPath);
			for (const error of errors) console.error(`dev-runner: ${error}`);
			// An unreadable file keeps the servers it last had; the server rewrites it whole on its next change.
			if (errors.length) return;
			const wanted = new Map(servers.map((s) => [s.name, s.config]));
			const changed = [...registered.keys()].filter(
				(name) => registered.get(name) !== JSON.stringify(wanted.get(name)),
			);
			for (const name of changed) {
				pi.unregisterMcpServer(name);
				registered.delete(name);
			}
			await until(changed, false);
			const added = [...wanted.keys()].filter((name) => !registered.has(name));
			for (const name of added) {
				pi.registerMcpServer(name, wanted.get(name)!);
				registered.set(name, JSON.stringify(wanted.get(name)));
			}
			await until(added, true);
		},
	};
}
