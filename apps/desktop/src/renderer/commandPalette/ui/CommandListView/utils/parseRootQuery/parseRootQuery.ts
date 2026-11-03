const COMMANDS_ONLY_PREFIX = ">";

export interface RootQuery {
	/** A leading ">" narrows the root to commands, the VS Code convention. */
	commandsOnly: boolean;
	query: string;
}

export function parseRootQuery(raw: string): RootQuery {
	const leading = raw.trimStart();
	if (leading.startsWith(COMMANDS_ONLY_PREFIX)) {
		return { commandsOnly: true, query: leading.slice(1) };
	}
	return { commandsOnly: false, query: raw };
}
