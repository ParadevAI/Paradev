export const IS_MAC =
	typeof navigator !== "undefined" &&
	/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

type Modifier = "mod" | "shift" | "alt";

const MAC_SYMBOLS: Record<Modifier, string> = {
	mod: "⌘",
	shift: "⇧",
	alt: "⌥",
};
const OTHER_NAMES: Record<Modifier, string> = {
	mod: "Ctrl",
	shift: "Shift",
	alt: "Alt",
};

/** "⌘⇧X" on macOS, "Ctrl+Shift+X" elsewhere. */
export function shortcutLabel(modifiers: Modifier[], key: string): string {
	return IS_MAC
		? `${modifiers.map((modifier) => MAC_SYMBOLS[modifier]).join("")}${key}`
		: [...modifiers.map((modifier) => OTHER_NAMES[modifier]), key].join("+");
}
