import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "../../types";

/**
 * The top-level menu's submenu rows: one per provider that can be browsed, in
 * priority order. `browsed` names those providers, whose own results the top
 * level leaves to their submenus.
 */
export function browseRows(
	providers: readonly ComposerMentionProvider[],
	open: (provider: ComposerMentionProvider) => void,
): { rows: ComposerMentionEntry[]; browsed: ReadonlySet<string> } {
	const browsable = providers
		.filter((provider) => provider.browse !== undefined)
		.sort((a, b) => a.priority - b.priority);
	return {
		rows: browsable.map((provider) => ({
			id: `browse:${provider.id}`,
			label: provider.browse?.label ?? provider.title,
			icon: provider.icon,
			opensSubmenu: true,
			select: () => open(provider),
		})),
		browsed: new Set(browsable.map((provider) => provider.id)),
	};
}
