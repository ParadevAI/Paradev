import { positional, string } from "@superset/cli-framework";
import { command } from "../../../lib/command";
import {
	findInstalled,
	readInstalledPlugins,
	resolvePluginRef,
} from "../../../lib/plugins/host";
import {
	ensureDefaultMarketplace,
	installPlugin,
	removePlugin,
	setPluginEnabled,
} from "../../../lib/plugins/install";
import { syncPluginMcpServers } from "../../../lib/plugins/mcp-servers";

export default command({
	description:
		"Apply a plugin change to this machine only, without touching the account",
	// The desktop app runs this and records the account side itself, so it
	// must work before `superset auth login`.
	hidden: true,
	skipMiddleware: true,
	sandbox: false,
	args: [
		positional("action")
			.enum("install", "uninstall", "enable", "disable")
			.required()
			.desc("What to do to the plugin on this machine"),
		positional("plugin")
			.required()
			.desc("Plugin name, or name@marketplace to disambiguate"),
	],
	options: {
		marketplace: string().desc(
			"Which marketplace to use, when several offer this name",
		),
	},
	run: async ({ args, options }) => {
		const { name, marketplace } = resolvePluginRef(
			args.plugin as string,
			options.marketplace as string | undefined,
		);
		const result = await applyLocally(
			args.action as LocalAction,
			name,
			marketplace,
		);
		if (!result.changed) {
			return {
				data: { ...result.data, mcpError: null },
				message: result.message,
			};
		}
		const { error: mcpError } = syncPluginMcpServers();
		return {
			data: { ...result.data, mcpError },
			message: mcpError
				? `${result.message} No agent can reach its tools until the MCP config is writable: ${mcpError}`
				: result.message,
		};
	},
});

type LocalAction = "install" | "uninstall" | "enable" | "disable";

async function applyLocally(
	action: LocalAction,
	name: string,
	marketplace: string | undefined,
): Promise<{
	changed: boolean;
	data: { name: string; marketplace: string | null };
	message: string;
}> {
	const installed = findInstalled(readInstalledPlugins(), name, marketplace);

	if (action === "install" || (action === "enable" && !installed)) {
		await ensureDefaultMarketplace();
		const local = await installPlugin(name, marketplace, { update: true });
		return {
			changed: true,
			data: { name: local.name, marketplace: local.marketplace },
			message: `Installed ${local.name}@${local.version} on this machine.`,
		};
	}

	if (!installed) {
		return {
			changed: false,
			data: { name, marketplace: marketplace ?? null },
			message: `${name} is not installed on this machine.`,
		};
	}

	if (action === "uninstall") {
		const removed = await removePlugin(name, installed.marketplace);
		return {
			changed: true,
			data: { name: removed.name, marketplace: removed.marketplace },
			message: `Removed ${removed.name} from this machine.`,
		};
	}

	const updated = await setPluginEnabled(
		name,
		action === "enable",
		installed.marketplace,
	);
	return {
		changed: true,
		data: { name: updated.name, marketplace: updated.marketplace },
		message: `${updated.name} ${updated.enabled ? "enabled" : "disabled"} on this machine.`,
	};
}
