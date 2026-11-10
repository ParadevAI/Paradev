import {
	isSettingsSectionVisible,
	SETTINGS_SECTION_GROUPS,
} from "renderer/routes/_authenticated/settings/utils/settingsSections";
import type { Command, CommandContext } from "../../core/types";

export function settingsTabCommands(context: CommandContext): Command[] {
	return SETTINGS_SECTION_GROUPS.flatMap((group) => group.items)
		.filter((item) =>
			isSettingsSectionVisible(item, context.settingsSectionVisibility),
		)
		.map((item) => ({
			id: `settings.${item.id.replace("/settings/", "")}`,
			title: item.label,
			section: "navigation",
			icon: item.icon,
			keywords: item.keywords,
			run: (ctx) => ctx.navigate(item.id),
		}));
}
