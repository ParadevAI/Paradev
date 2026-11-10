export type SwitcherScope = "sidebar" | "all";

export interface SwitcherQuery {
	scope: SwitcherScope;
	/** A creator name prefix, from "#name"; null for anyone. */
	creator: string | null;
	/** What ranks the rows, with the "#" and the creator removed. */
	text: string;
}

function words(text: string): string[] {
	return text.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesCreator(name: string | null, token: string): boolean {
	if (!name) return false;
	return words(name).some((word) => word.startsWith(token));
}

/**
 * "#" widens the switcher from the sidebar to every workspace. The word
 * right after it names a creator when some creator matches it ("#harshith"),
 * otherwise it is plain search text.
 */
export function parseSwitcherQuery(
	raw: string,
	creatorNames: Iterable<string | null>,
): SwitcherQuery {
	const trimmed = raw.trim();
	if (!trimmed.startsWith("#")) {
		return { scope: "sidebar", creator: null, text: trimmed };
	}
	const rest = trimmed.slice(1).trimStart();
	const [first = "", ...others] = rest.split(/\s+/);
	const token = first.toLowerCase();
	let namesCreator = false;
	if (token) {
		for (const name of creatorNames) {
			if (matchesCreator(name, token)) {
				namesCreator = true;
				break;
			}
		}
	}
	return namesCreator
		? { scope: "all", creator: token, text: others.join(" ") }
		: { scope: "all", creator: null, text: rest };
}
