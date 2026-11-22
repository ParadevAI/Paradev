import type { Terminal } from "@xterm/xterm";

type ReplayTerminal = Pick<Terminal, "parser" | "write">;

// Window operations that xterm answers with a size report.
const WINDOW_REPORTS = new Set([14, 16, 18]);

// OSC colors that xterm answers when the payload asks with "?".
const COLOR_QUERY_OSC = [4, 10, 11, 12];

const replayStates = new WeakMap<ReplayTerminal, { replaying: boolean }>();

/**
 * Every query that xterm or its image addon answers. A handler that returns
 * true stops the parser there, so no reply is made. Register after the addons
 * and the XTVERSION reply: the parser runs the last handler first. The
 * terminal owns the handlers and disposes them with itself.
 */
function installReplySilencer(terminal: ReplayTerminal): { replaying: boolean } {
	const state = { replaying: false };
	const silent = () => state.replaying;
	const { parser } = terminal;
	parser.registerCsiHandler({ final: "c" }, silent);
	parser.registerCsiHandler({ prefix: ">", final: "c" }, silent);
	parser.registerCsiHandler({ final: "n" }, silent);
	parser.registerCsiHandler({ prefix: "?", final: "n" }, silent);
	parser.registerCsiHandler({ intermediates: "$", final: "p" }, silent);
	parser.registerCsiHandler(
		{ prefix: "?", intermediates: "$", final: "p" },
		silent,
	);
	parser.registerCsiHandler({ prefix: ">", final: "q" }, silent);
	parser.registerCsiHandler({ prefix: "?", final: "u" }, silent);
	parser.registerCsiHandler({ prefix: "?", final: "S" }, silent);
	parser.registerCsiHandler(
		{ final: "t" },
		(params) => state.replaying && WINDOW_REPORTS.has(Number(params[0])),
	);
	parser.registerDcsHandler({ intermediates: "$", final: "q" }, silent);
	for (const ident of COLOR_QUERY_OSC) {
		parser.registerOscHandler(
			ident,
			(data) => state.replaying && data.includes("?"),
		);
	}
	return state;
}

/**
 * Write bytes the host replays from its catch-up ring. Their queries were
 * asked before this pane saw them, and the host or an attached pane answered
 * them then, so xterm must not answer them again: a late reply reaches the
 * shell as typed text. Only parser handlers are silenced, so keys the user
 * types meanwhile still go to the PTY.
 */
export function writeReplayedOutput(
	terminal: ReplayTerminal,
	data: Uint8Array,
	done?: () => void,
): void {
	let state = replayStates.get(terminal);
	if (!state) {
		state = installReplySilencer(terminal);
		replayStates.set(terminal, state);
	}
	const replay = state;
	// Write callbacks run in order, just after their chunk is parsed, so the
	// flag is set for exactly the replayed bytes.
	terminal.write("", () => {
		replay.replaying = true;
	});
	terminal.write(data, () => {
		replay.replaying = false;
		done?.();
	});
}
