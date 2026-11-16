/** The toast for a send whose plain `@Name`s several Devs share; null when there were none. */
export function ambiguityHint(names: string[]): string | null {
	if (names.length === 0) return null;
	if (names.length === 1)
		return `Several Devs are called ${names[0]} — pick one`;
	return `Several Devs are called ${names.slice(0, -1).join(", ")} or ${names.at(-1)} — pick one`;
}
