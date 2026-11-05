import type { MenuTextMatch } from "@lexical/react/LexicalTypeaheadMenuPlugin";

const BRACKET_PAIRS = [
	["(", ")"],
	["[", "]"],
] as const;

function closesOnlyItsOwnBrackets(token: string): boolean {
	return BRACKET_PAIRS.every(([open, close]) => {
		let depth = 0;
		for (const char of token) {
			if (char === open) depth++;
			else if (char === close && --depth < 0) return false;
		}
		return true;
	});
}

export function matchToken(
	text: string,
	trigger: string,
): MenuTextMatch | null {
	// Route paths such as `[id]`, `(group)` and `$param` are file names too.
	const pattern = new RegExp(`(^|\\s)(\\${trigger}([\\w./:$()[\\]+~-]*))$`);
	const match = pattern.exec(text);
	if (!match) return null;
	const matchingString = match[3] ?? "";
	if (!closesOnlyItsOwnBrackets(matchingString)) return null;
	const leadOffset = match.index + (match[1]?.length ?? 0);
	return {
		leadOffset,
		matchingString,
		replaceableString: match[2] ?? "",
	};
}
