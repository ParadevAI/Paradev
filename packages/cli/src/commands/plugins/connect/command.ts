import { CLIError, positional, string, table } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import { authorizeUrl, chooseAuthMethod } from "../../../lib/plugins/connect";
import {
	findInstalled,
	readInstalledPlugins,
	resolvePluginRef,
} from "../../../lib/plugins/host";
import {
	type AuthInputSpec,
	missingInputsError,
	parseInputs,
} from "../../../lib/plugins/inputs";
import { syncPluginMcpServers } from "../../../lib/plugins/mcp-servers";

export default command({
	sandbox: false,
	description: "Connect an account to an installed plugin",
	args: [
		positional("plugin")
			.required()
			.desc("Plugin name, or name@marketplace to disambiguate"),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace's install to connect, when several offer this name",
		),
		method: string()
			.enum("oauth2", "api_key")
			.desc("Which declared auth method to use, when a plugin offers several"),
		inputs: string().desc(
			'Credential inputs as JSON, or "-" to read them from stdin',
		),
	},
	display: (data) =>
		table(
			(data ?? []) as Record<string, unknown>[],
			["plugin", "status", "detail"],
			["PLUGIN", "STATUS", "DETAIL"],
			[18, 16, 60],
		),
	run: async ({ ctx, args, options }) => {
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);
		const installed = findInstalled(readInstalledPlugins(), name, marketplace);
		if (!installed) {
			throw new CLIError(
				marketplace
					? `"${name}" is not installed from "${marketplace}". Run: superset plugins install ${name} --marketplace ${marketplace}`
					: `"${name}" is not installed. Run: superset plugins install ${name}`,
			);
		}

		const catalog = await ctx.api.plugins.list.query();
		const slug =
			catalog.find(
				(entry) =>
					entry.name === name &&
					(!marketplace || entry.marketplace === marketplace),
			)?.connector ?? undefined;

		if (!slug) {
			return {
				data: [{ plugin: name, status: "not required", detail: "" }],
				message: `"${name}" needs no connection.`,
			};
		}

		const connector = await ctx.api.connectors.get.query({ slug });
		const methods = connector.methods;

		const auth = chooseAuthMethod({
			command: "connect",
			pluginName: name,
			slug,
			methods,
			requested: options.method as string | undefined,
		});

		const declared = (auth.inputs ?? []) as AuthInputSpec[];
		const provided = await parseInputs(options.inputs as string | undefined);

		if (auth.type === "api_key") {
			const missing = declared.filter(
				(input) => input.required !== false && !provided[input.name],
			);
			if (missing.length) throw missingInputsError(name, missing, declared);

			const organization = await ctx.api.user.myOrganization.query();
			if (!organization) {
				throw new CLIError(
					"You need to be part of an organization to connect accounts.",
				);
			}

			const created = await ctx.api.connectors.connectApiKey.mutate({
				organizationId: organization.id,
				slug,
				inputs: provided,
			});

			const mcp = syncPluginMcpServers();

			return {
				data: [
					{ plugin: name, status: "connected", detail: created.connectionId },
				],
				message: mcp.error
					? `Connected ${slug} for ${name}, but the agent MCP config could not be written: ${mcp.error}`
					: `Connected ${slug} for ${name}.`,
			};
		}

		const organization = await ctx.api.user.myOrganization.query();
		if (!organization) {
			throw new CLIError(
				"You need to be part of an organization to connect accounts.",
			);
		}
		const url = authorizeUrl({
			command: "connect",
			pluginName: name,
			slug,
			auth,
			provided,
			organizationId: organization.id,
		});

		return {
			data: [{ plugin: name, status: "authorize", detail: url }],
			message: [
				`Open this URL to authorize ${name}:`,
				`  ${url}`,
				"",
				`Then confirm with: superset plugins list`,
			].join("\n"),
		};
	},
});
