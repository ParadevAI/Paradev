import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
	CLIError,
	positional,
	string,
	suggestSimilar,
	table,
} from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { resolveOrganizationId } from "../../../lib/config";
import { resolvePluginName } from "../../../lib/plugins/connection-ref";
import { connectPluginMcp } from "../../../lib/plugins/mcp-client";
import { schemaFields } from "./schemaFields";

interface ToolRow {
	plugin: string;
	tool: string;
	description: string;
	inputSchema: Tool["inputSchema"];
	outputSchema?: Tool["outputSchema"];
}

function fieldTable(schema: Tool["inputSchema"]): string {
	const fields = schemaFields(schema);
	if (fields.length === 0) return "None.";
	return table(
		fields as unknown as Record<string, unknown>[],
		["name", "type", "required", "default", "description"],
		["NAME", "TYPE", "REQUIRED", "DEFAULT", "DESCRIPTION"],
		[30, 24, 8, 16, 80],
	);
}

function describeTool(row: ToolRow): string {
	return [
		`${row.tool} (${row.plugin})`,
		row.description,
		`Arguments:\n${fieldTable(row.inputSchema)}`,
		`Output:\n${row.outputSchema ? fieldTable(row.outputSchema) : "Not declared by the server."}`,
	]
		.filter(Boolean)
		.join("\n\n");
}

export default command({
	description:
		"List the tools a connected plugin exposes, or show one tool's arguments and output",
	args: [
		positional("tool").desc("Tool name, to show its arguments and output"),
	],
	options: {
		plugin: string().desc("Plugin name from `paradev plugins list`"),
		account: string().desc(
			"Connection id, when the plugin's connector has more than one account",
		),
		connection: string().desc("Deprecated alias for --plugin"),
		pluginId: string().desc("Deprecated alias for --plugin"),
	},
	display: (data) =>
		Array.isArray(data)
			? table(
					data as Record<string, unknown>[],
					["plugin", "tool", "description"],
					["PLUGIN", "TOOL", "DESCRIPTION"],
					[16, 30, 70],
				)
			: describeTool(data as ToolRow),
	run: async ({ ctx, args, options }) => {
		const pluginName = resolvePluginName({
			plugin: options.plugin as string | undefined,
			connection: options.connection as string | undefined,
			pluginId: options.pluginId as string | undefined,
		});

		const { client, ref } = await connectPluginMcp(
			pluginName,
			{
				bearer: ctx.bearer,
				organizationId: resolveOrganizationId(ctx.config),
			},
			options.account as string | undefined,
		);
		try {
			const { tools } = await client.listTools();
			const rows: ToolRow[] = tools.map((tool) => ({
				plugin: ref.plugin,
				tool: tool.name,
				description: tool.description ?? "",
				inputSchema: tool.inputSchema,
				outputSchema: tool.outputSchema,
			}));

			const name = args.tool as string | undefined;
			if (name === undefined) {
				return {
					data: rows,
					message: `${rows.length} tool${rows.length === 1 ? "" : "s"} on ${ref.plugin}.`,
				};
			}
			const row = rows.find((candidate) => candidate.tool === name);
			if (!row) {
				const similar = suggestSimilar(
					name,
					rows.map((candidate) => candidate.tool),
				);
				throw new CLIError(
					`${ref.plugin} has no tool "${name}".`,
					similar
						? `Did you mean ${similar}?`
						: `Run: paradev mcp tools --plugin ${pluginName}`,
				);
			}
			return { data: row };
		} finally {
			await client.close();
		}
	},
});
