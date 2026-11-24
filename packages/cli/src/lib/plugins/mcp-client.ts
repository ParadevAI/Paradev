import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { CLIError } from "@superset/cli-framework";
import { ORGANIZATION_HEADER } from "@superset/shared/constants";
import {
	DEFAULT_MARKETPLACE,
	organizationMarketplace,
} from "@superset/shared/plugins";
import { getApiUrl } from "../config";
import {
	type InstalledPlugin,
	parsePluginRef,
	readInstalledPlugins,
} from "./host";

export interface PluginRef {
	plugin: string;
	marketplace: string;
}

export function resolveMcpPluginRef(
	ref: string,
	organizationId: string | undefined,
	installed: InstalledPlugin[],
): PluginRef {
	const { name, marketplace } = parsePluginRef(ref);
	if (marketplace === "organization") {
		if (!organizationId) {
			throw new CLIError(
				`"${ref}" names your organization's marketplace, but no organization is active.`,
				"Run: paradev organization switch <id>",
			);
		}
		return {
			plugin: name,
			marketplace: organizationMarketplace(organizationId),
		};
	}
	if (marketplace !== undefined) return { plugin: name, marketplace };

	const matches = installed.filter(
		(entry) => entry.name === name && entry.enabled,
	);
	if (matches.length > 1) {
		throw new CLIError(
			`"${name}" is installed from more than one marketplace.`,
			`Name one: ${matches.map((entry) => `--plugin ${name}@${entry.marketplace}`).join(" or ")}`,
		);
	}
	return {
		plugin: name,
		marketplace: matches[0]?.marketplace ?? DEFAULT_MARKETPLACE,
	};
}

export function pluginMcpUrl(ref: PluginRef, connection?: string): URL {
	const url = new URL(
		`${getApiUrl()}/mcp/plugins/${encodeURIComponent(ref.marketplace)}/${encodeURIComponent(ref.plugin)}`,
	);
	if (connection) url.searchParams.set("connection", connection);
	return url;
}

export function pluginMcpHeaders(
	bearer: string,
	organizationId: string | undefined,
): Record<string, string> {
	const headers: Record<string, string> = {};
	if (bearer) headers.Authorization = `Bearer ${bearer}`;
	if (organizationId) headers[ORGANIZATION_HEADER] = organizationId;
	return headers;
}

export async function connectPluginMcp(
	name: string,
	auth: { bearer: string; organizationId: string | undefined },
	connection?: string,
	sessionId?: string,
): Promise<{
	client: Client;
	transport: StreamableHTTPClientTransport;
	ref: PluginRef;
}> {
	const ref = resolveMcpPluginRef(
		name,
		auth.organizationId,
		readInstalledPlugins(),
	);
	const client = new Client({ name: "superset-cli", version: "1.0.0" });
	const transport = new StreamableHTTPClientTransport(
		pluginMcpUrl(ref, connection),
		{
			requestInit: {
				headers: pluginMcpHeaders(auth.bearer, auth.organizationId),
			},
			sessionId,
		},
	);
	try {
		await client.connect(transport);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// The server answers 409 AMBIGUOUS_CONNECTION when the plugin's connector
		// holds more than one account and the request named none. "Check it is
		// connected" is the wrong hint for that: it is connected twice, which is
		// the problem.
		const hint = message.includes("AMBIGUOUS_CONNECTION")
			? `Pass --account <id> to pick one. Run: paradev plugins list  (the CONNECTION column holds the id)`
			: "Run: paradev plugins list  (check the plugin is installed and connected)";
		throw new CLIError(
			`Could not reach the "${ref.plugin}" plugin: ${message}`,
			hint,
		);
	}
	return { client, transport, ref };
}
