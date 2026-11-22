import { getPresetIcon } from "renderer/assets/app-icons/preset-icons";
import { getPluginIconUrl } from "renderer/components/PluginIcon";

export function mcpServerIconUrl(
	agent: string,
	plugin: string | null | undefined,
	isDark: boolean,
): string | undefined {
	return plugin
		? getPluginIconUrl(plugin, isDark)
		: getPresetIcon(agent, isDark);
}
