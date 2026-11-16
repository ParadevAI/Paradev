import { TERMINAL_VERSION_NAME } from "@superset/shared/constants";
import type { IDisposable, Terminal } from "@xterm/xterm";

// Claude Code reads the XTVERSION reply and, for any name starting with
// "xterm.js", switches to its "wheel flood" mode: no scroll acceleration,
// tuned for stock xterm.js's damped wheel stream. Our wheel handler sends the
// native-grade stream kitty and Ghostty send, so we answer with a name that
// keeps the xterm.js marker (other TUIs match it as a substring) but does not
// start with it, and Claude scrolls as it does in a native terminal. The daemon
// answers the same query before a renderer attaches; both import the name from
// shared so the two replies cannot drift apart.
export { TERMINAL_VERSION_NAME };

export function installTerminalVersionReply(
	terminal: Pick<Terminal, "parser" | "input">,
): IDisposable {
	return terminal.parser.registerCsiHandler(
		{ prefix: ">", final: "q" },
		(params) => {
			const first = params[0];
			if (typeof first === "number" && first > 0) return true;
			terminal.input(`\x1bP>|${TERMINAL_VERSION_NAME}\x1b\\`, false);
			return true;
		},
	);
}
