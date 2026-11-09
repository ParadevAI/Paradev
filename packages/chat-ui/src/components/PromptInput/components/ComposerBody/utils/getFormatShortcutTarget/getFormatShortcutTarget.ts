import { isExactShortcutMatch } from "lexical";

type ShortcutEvent = Parameters<typeof isExactShortcutMatch>[0];

const APPLE_FORMAT_MASK = { metaKey: true } as const;
const OTHER_FORMAT_MASK = { ctrlKey: true } as const;

export function getFormatShortcutTarget(
	event: ShortcutEvent,
	{ isApple, hasSelection }: { isApple: boolean; hasSelection: boolean },
): "editor" | "app" | null {
	const mask = isApple ? APPLE_FORMAT_MASK : OTHER_FORMAT_MASK;
	const isBold = isExactShortcutMatch(event, "b", mask);
	if (!isBold && !isExactShortcutMatch(event, "i", mask)) return null;
	// The desktop binds ⌘B to its sidebar toggle; it binds neither Ctrl+B nor ⌘I.
	return isApple && isBold && !hasSelection ? "app" : "editor";
}
