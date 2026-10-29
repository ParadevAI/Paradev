import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "../../types";

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
