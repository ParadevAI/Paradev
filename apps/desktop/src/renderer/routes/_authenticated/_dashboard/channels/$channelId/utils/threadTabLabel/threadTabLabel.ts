const LABEL_MAX_LENGTH = 48;

/** A thread tab is named after its first message, like a page after its title. */
export function threadTabLabel(body: string, fallback: string): string {
	const flat = body.replace(/\s+/g, " ").trim();
	if (!flat) return fallback;
	return flat.length > LABEL_MAX_LENGTH
		? `${flat.slice(0, LABEL_MAX_LENGTH - 1)}…`
		: flat;
}
