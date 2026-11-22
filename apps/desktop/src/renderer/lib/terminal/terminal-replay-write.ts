import type { IFunctionIdentifier, Terminal } from "@xterm/xterm";

type ReplayTerminal = Pick<Terminal, "parser" | "write">;

const ANSWERED_CSI: IFunctionIdentifier[] = [
	{ final: "c" },
	{ prefix: ">", final: "c" },
	{ final: "n" },
	{ prefix: "?", final: "n" },
	{ intermediates: "$", final: "p" },
	{ prefix: "?", intermediates: "$", final: "p" },
	{ prefix: ">", final: "q" },
	{ prefix: "?", final: "u" },
	{ prefix: "?", final: "S" },
];

const replayStates = new WeakMap<ReplayTerminal, { replaying: boolean }>();

// The parser runs the newest handler first, so this must be installed after
// the image addon and the XTVERSION reply, or their answers come first.
function installReplySilencer(terminal: ReplayTerminal) {
	const state = { replaying: false };
	const silent = () => state.replaying;
	for (const id of ANSWERED_CSI) terminal.parser.registerCsiHandler(id, silent);
	terminal.parser.registerDcsHandler(
		{ intermediates: "$", final: "q" },
		silent,
	);
	return state;
}

/**
 * Writes bytes the host replays from its catch-up ring. Their queries were
 * answered when they were live, so xterm must not answer them again: a late
 * answer reaches the shell as typed text.
 */
export function writeReplayedOutput(
	terminal: ReplayTerminal,
	data: Uint8Array,
): void {
	let state = replayStates.get(terminal);
	if (!state) {
		state = installReplySilencer(terminal);
		replayStates.set(terminal, state);
	}
	const replay = state;
	terminal.write("", () => {
		replay.replaying = true;
	});
	terminal.write(data, () => {
		replay.replaying = false;
	});
}
