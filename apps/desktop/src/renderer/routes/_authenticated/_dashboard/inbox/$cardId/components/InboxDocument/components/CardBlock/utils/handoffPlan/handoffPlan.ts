/** A clause of the server's plan with what the reader wrote put in for its `{name}` marks. */
export function fillClause(
	clause: string,
	parts: Record<string, string>,
): string {
	return clause.replace(/\{(\w+)\}/g, (mark, name: string) =>
		name in parts ? (parts[name] as string) : mark,
	);
}

/** The confirm for the writes still to make, in order; none when nothing is left to write. The server builds the same sentence from the same clauses and refuses an action whose sentence differs, so it is not translated. */
export function planSentence(clauses: string[]): string | undefined {
	if (clauses.length === 0) return undefined;
	const plan = clauses.join(", then ");
	return `${plan.charAt(0).toUpperCase()}${plan.slice(1)}?`;
}
