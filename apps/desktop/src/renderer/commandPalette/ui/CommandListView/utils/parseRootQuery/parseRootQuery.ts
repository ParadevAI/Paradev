const COMMANDS_ONLY_PREFIX = ">";

export interface RootQuery {
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
