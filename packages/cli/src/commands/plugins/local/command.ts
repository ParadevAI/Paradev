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
		const installed = findInstalled(readInstalledPlugins(), name, marketplace);

		if (args.action === "install" || (args.action === "enable" && !installed)) {
			await ensureDefaultMarketplace();
			const local = await installPlugin(name, marketplace, { update: true });
			return {
				data: { name: local.name, marketplace: local.marketplace },
				message: `Installed ${local.name}@${local.version} on this machine.`,
			};
		}

		if (!installed) {
			return {
				data: { name, marketplace: marketplace ?? null },
				message: `${name} is not installed on this machine.`,
			};
		}

		if (args.action === "uninstall") {
			const removed = await removePlugin(name, installed.marketplace);
			return {
				data: { name: removed.name, marketplace: removed.marketplace },
				message: `Removed ${removed.name} from this machine.`,
			};
		}

		const updated = await setPluginEnabled(
			name,
			args.action === "enable",
			installed.marketplace,
		);
		return {
			data: { name: updated.name, marketplace: updated.marketplace },
			message: `${updated.name} ${updated.enabled ? "enabled" : "disabled"} on this machine.`,
		};
	},
});
