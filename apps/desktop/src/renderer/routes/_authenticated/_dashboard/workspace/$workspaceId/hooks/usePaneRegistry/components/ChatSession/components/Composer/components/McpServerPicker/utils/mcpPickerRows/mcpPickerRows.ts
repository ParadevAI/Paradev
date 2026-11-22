import type { McpServerEntry } from "@superset/shared/mcp-servers";
import { SUPERSET_API_URL } from "@superset/shared/plugins";
import type { McpPickerPlugin } from "../../../../utils/mcpPickerPlugins";

interface RowBase {
	key: string;
	name: string;
	plugin: McpPickerPlugin | null;
	server: McpServerEntry | null;
}

export type McpPickerRow = RowBase &
	(
		| { kind: "available"; server: McpServerEntry }
		| { kind: "action"; action: "install"; plugin: McpPickerPlugin }
		| {
				kind: "action";
				action: "connect";
				plugin: McpPickerPlugin;
				connector: string;
		  }
		| {
				kind: "unavailable";
				reason: "disabled" | "other-agent" | "untrusted" | "next-session";
		  }
	);

export type McpPickerActionRow = Extract<McpPickerRow, { kind: "action" }>;

const ORDER = { available: 0, action: 1, unavailable: 2 } as const;
const PROXY_PREFIX = `${SUPERSET_API_URL}/mcp/plugins/`;

function pluginOfServer(
	server: McpServerEntry,
	plugins: readonly McpPickerPlugin[],
): McpPickerPlugin | null {
	if (server.url?.startsWith(PROXY_PREFIX)) {
		const name = server.url.slice(PROXY_PREFIX.length).split("/")[1];
		return plugins.find((candidate) => candidate.name === name) ?? null;
	}
	return (
		plugins.find(
			(candidate) =>
				candidate.installed &&
				(candidate.servers.includes(server.name) ||
					(server.url !== undefined && candidate.urls.includes(server.url))),
		) ?? null
	);
}

function configuredRow(
	server: McpServerEntry,
	plugins: readonly McpPickerPlugin[],
): McpPickerRow {
	const plugin = pluginOfServer(server, plugins);
	const base = {
		key: `${server.agent}:${server.scope}:${server.configPath}:${server.name}`,
		name: server.name,
		plugin,
		server,
	};
	if (server.state !== "available")
		return { ...base, kind: "unavailable", reason: server.state };
	if (plugin?.connector && !plugin.connected)
		return {
			...base,
			kind: "action",
			action: "connect",
			plugin,
			connector: plugin.connector,
		};
	return { ...base, kind: "available", server };
}

function setupRows(
	servers: readonly McpServerEntry[],
	plugins: readonly McpPickerPlugin[],
): McpPickerRow[] {
	const ours = servers.filter((server) => server.state !== "other-agent");
	const configured = new Set(ours.map((server) => server.name));
	const covered = new Set(
		ours.flatMap((server) => pluginOfServer(server, plugins)?.name ?? []),
	);
	return plugins.flatMap((plugin) =>
		(covered.has(plugin.name) ? [] : plugin.servers)
			.filter((name) => !configured.has(name))
			.map((name): McpPickerRow => {
				const base = {
					key: `plugin:${plugin.name}:${name}`,
					name,
					plugin,
					server: null,
				};
				if (plugin.connector && !plugin.connected)
					return {
						...base,
						kind: "action",
						action: "connect",
						plugin,
						connector: plugin.connector,
					};
				if (!plugin.installed)
					return { ...base, kind: "action", action: "install", plugin };
				return { ...base, kind: "unavailable", reason: "next-session" };
			}),
	);
}

export function mcpPickerRows(
	servers: readonly McpServerEntry[],
	plugins: readonly McpPickerPlugin[],
	query: string,
): McpPickerRow[] {
	const search = query.trim().toLowerCase();
	return [
		...servers.map((server) => configuredRow(server, plugins)),
		...setupRows(servers, plugins),
	]
		.filter(
			(row) =>
				!search ||
				[
					row.name,
					row.plugin?.displayName,
					row.server?.agent,
					row.server?.scope,
				]
					.join(" ")
					.toLowerCase()
					.includes(search),
		)
		.sort(
			(a, b) =>
				ORDER[a.kind] - ORDER[b.kind] ||
				a.name.localeCompare(b.name) ||
				a.key.localeCompare(b.key),
		);
}
