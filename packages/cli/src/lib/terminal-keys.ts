import { CLIError } from "@superset/cli-framework";

const NAMED_KEYS: Record<string, string> = {
	esc: "\x1b",
	escape: "\x1b",
	enter: "\r",
	return: "\r",
	tab: "\t",
	"shift+tab": "\x1b[Z",
	backspace: "\x7f",
	space: " ",
	comma: ",",
	up: "\x1b[A",
	down: "\x1b[B",
	right: "\x1b[C",
	left: "\x1b[D",
	home: "\x1b[H",
	end: "\x1b[F",
	pageup: "\x1b[5~",
	pagedown: "\x1b[6~",
	delete: "\x1b[3~",
	f1: "\x1bOP",
	f2: "\x1bOQ",
	f3: "\x1bOR",
	f4: "\x1bOS",
	f5: "\x1b[15~",
	f6: "\x1b[17~",
	f7: "\x1b[18~",
	f8: "\x1b[19~",
	f9: "\x1b[20~",
	f10: "\x1b[21~",
	f11: "\x1b[23~",
	f12: "\x1b[24~",
};

const ARROW_KEYS: Record<string, string> = {
	up: "A",
	down: "B",
	right: "C",
	left: "D",
};

/** xterm's modifier parameter is 1 + the bit mask (shift 1, alt 2, ctrl 4). */
const MODIFIER_BITS: Record<string, number> = {
	shift: 1,
	alt: 2,
	ctrl: 4,
};

/**
 * A modified cursor key is one CSI sequence, `CSI 1;<modifier> <letter>`, not
 * an Escape prefixed to the plain arrow: `ESC ESC [ A` is what a TUI reads as
 * "Escape, then Up", so a chord built that way never reaches the binding it
 * asks for.
 */
function modifiedArrow(parts: string[]): string | undefined {
	const last = parts[parts.length - 1] ?? "";
	// Own properties only: both tables inherit from Object.prototype, so
	// `shift+__proto__` would otherwise read an object and encode
	// "\x1b[1;2[object Object]".
	if (!Object.hasOwn(ARROW_KEYS, last)) return undefined;
	const arrow = ARROW_KEYS[last];
	let bits = 0;
	for (const part of parts.slice(0, -1)) {
		const bit = Object.hasOwn(MODIFIER_BITS, part)
			? MODIFIER_BITS[part]
			: undefined;
		// An unknown or repeated modifier is not a chord we can encode.
		if (!bit || (bits & bit) !== 0) return undefined;
		bits |= bit;
	}
	return bits === 0 ? undefined : `\x1b[1;${bits + 1}${arrow}`;
}

export const INTERRUPT_KEYS = new Set(["\x1b", "\x03"]);

export function parseTerminalKeys(spec: string): string[] {
	const names = spec
		.split(",")
		.map((name) => name.trim())
		.filter(Boolean);
	if (names.length === 0) {
		throw new CLIError("No keys given", "Example: --keys esc or --keys ctrl+c");
	}
	return names.map(keyBytes);
}

function keyBytes(key: string): string {
	if ([...key].length === 1) return key;
	const name = key.toLowerCase().replace(/^c-/, "ctrl+").replace(/^m-/, "alt+");
	const named = Object.hasOwn(NAMED_KEYS, name) ? NAMED_KEYS[name] : undefined;
	if (named) return named;
	const parts = name.split("+");
	const arrow = modifiedArrow(parts);
	if (arrow) return arrow;
	// A key that ends in an arrow but whose modifiers did not form a chord is
	// malformed. The alt fallback would recurse and send a different chord:
	// `alt+alt+shift+up` used to become ESC ESC [1;4A instead of failing.
	const last = parts[parts.length - 1] ?? "";
	if (parts.length > 1 && Object.hasOwn(ARROW_KEYS, last)) {
		throw new CLIError(
			`Unknown key: ${key}`,
			`Use shift, alt or ctrl once before an arrow: shift|alt|ctrl+<arrow>`,
		);
	}
	const ctrl = /^ctrl\+([a-z])$/.exec(name);
	if (ctrl?.[1]) return String.fromCharCode(ctrl[1].charCodeAt(0) - 96);
	const alt = /^alt\+(.+)$/.exec(name);
	if (alt?.[1]) return `\x1b${keyBytes(alt[1])}`;
	throw new CLIError(
		`Unknown key: ${key}`,
		`Use a single character, ctrl+<letter>, alt+<key>, shift|alt|ctrl+<arrow>, or one of: ${Object.keys(NAMED_KEYS).join(", ")}`,
	);
}
