import type { ComposerSlashCommand } from "../../Composer.types";

/**
 * The commands to suggest for `draft`, or null to keep the panel closed. The
 * same rules as the iOS `ComposerSlashMatching`: the draft must be a bare
 * trigger token, and a fully typed command that takes arguments closes it.
 */
export function slashSuggestions(
	draft: string,
	commands: ComposerSlashCommand[],
): ComposerSlashCommand[] | null {
	const trigger = draft[0];
	if ((trigger !== "/" && trigger !== "$") || commands.length === 0) {
		return null;
	}
	const query = draft.slice(1);
	if (/\s/.test(query)) return null;
	const needle = query.toLowerCase();

	const committed = commands.some(
		(command) =>
			command.trigger === trigger &&
			(command.name.toLowerCase() === needle ||
				command.aliases?.some((alias) => alias.toLowerCase() === needle)) &&
			(command.argumentHint ?? "").trim().length > 0,
	);
	if (committed) return null;

	const matches = commands
		.filter((command) => command.trigger === trigger)
		.map((command) => ({ command, rank: commandRank(command, needle) }))
		.filter(
			(match): match is { command: ComposerSlashCommand; rank: number } =>
				match.rank !== null,
		)
		.sort((a, b) => {
			if (a.rank !== b.rank) return a.rank - b.rank;
			if (!!a.command.isBuiltin !== !!b.command.isBuiltin) {
				return a.command.isBuiltin ? 1 : -1;
			}
			return a.command.name < b.command.name
				? -1
				: a.command.name > b.command.name
					? 1
					: 0;
		})
		.map((match) => match.command);
	return matches.length > 0 ? matches : null;
}

/** What selecting `command` puts in the draft. */
export function committedSlashDraft(command: ComposerSlashCommand): string {
	return `${command.trigger}${command.name} `;
}

function nameRank(name: string, query: string): number | null {
	if (query === "") return 0;
	const lower = name.toLowerCase();
	if (lower === query) return 0;
	if (lower.startsWith(query)) return 1;
	if (lower.includes(query)) return 2;
	return null;
}

function commandRank(
	command: ComposerSlashCommand,
	query: string,
): number | null {
	const rank = nameRank(command.name, query);
	if (rank !== null) return rank;
	const aliasRanks = (command.aliases ?? [])
		.map((alias) => nameRank(alias, query))
		.filter((value): value is number => value !== null);
	return aliasRanks.length > 0 ? Math.min(...aliasRanks) + 3 : null;
}
