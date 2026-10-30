const ESC = "\u001b";
const BRACKETED_PASTE_MARKERS = [`${ESC}[200~`, `${ESC}[201~`];
const SUBMIT_OR_CANCEL = ["\r", "\n", "\u0003"];

function isPrintable(char: string): boolean {
	const code = char.charCodeAt(0);
	return code >= 0x20 && code !== 0x7f;
}

/**
 * The login prompts read the code or key with echo off, so the terminal shows
 * nothing after a paste. Tracks whether the user entered text that is still
 * waiting for Enter. Escape sequences (arrow keys, xterm's replies to terminal
 * queries) do not count as input.
 */
export function nextHiddenInputPending(
	pending: boolean,
	data: string,
): boolean {
	let text = data;
	for (const marker of BRACKETED_PASTE_MARKERS)
		text = text.split(marker).join("");
	if (SUBMIT_OR_CANCEL.some((char) => text.includes(char))) return false;
	if (text.startsWith(ESC)) return pending;
	return pending || Array.from(text).some(isPrintable);
}
