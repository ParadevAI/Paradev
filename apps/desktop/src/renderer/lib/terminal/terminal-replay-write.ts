import type { Terminal } from "@xterm/xterm";

type ReplayTerminal = Pick<Terminal, "input" | "options" | "write"> &
	Partial<Pick<Terminal, "onKey" | "paste" | "textarea">>;

interface ReplayState {
	replaying: boolean;
	held: (() => void)[];
}

const replayStates = new WeakMap<ReplayTerminal, ReplayState>();

// xterm parses a chunk in one synchronous call, so input cannot arrive in the
// middle of one. It can arrive while an async handler (an inline image
// decode) holds the parse open, and stdin is disabled then: keep it for later.
function replayStateFor(terminal: ReplayTerminal): ReplayState {
	const existing = replayStates.get(terminal);
	if (existing) return existing;
	const state: ReplayState = { replaying: false, held: [] };
	terminal.onKey?.(({ key }) => {
		if (state.replaying) state.held.push(() => terminal.input(key, true));
	});
	terminal.textarea?.addEventListener("paste", (event) => {
		const text = event.clipboardData?.getData("text/plain");
		if (state.replaying && text) state.held.push(() => terminal.paste?.(text));
	});
	replayStates.set(terminal, state);
	return state;
}

export function isReplaying(terminal: ReplayTerminal): boolean {
	return replayStates.get(terminal)?.replaying ?? false;
}

function deliverUserInput(terminal: ReplayTerminal, deliver: () => void) {
	const state = replayStates.get(terminal);
	if (state?.replaying) state.held.push(deliver);
	else deliver();
}

/** For input the app sends on the user's behalf, outside xterm's key path. */
export function sendUserInput(terminal: ReplayTerminal, data: string): void {
	deliverUserInput(terminal, () => terminal.input(data, true));
}

/** For text the app pastes on the user's behalf (paste command, drops). */
export function pasteUserText(terminal: ReplayTerminal, text: string): void {
	deliverUserInput(terminal, () => terminal.paste?.(text));
}

/**
 * Writes bytes the host replays from its catch-up ring. Their queries were
 * answered when they were live, and a second answer reaches the shell as
 * typed text. xterm sends nothing to the PTY while `disableStdin` is set.
 */
export function writeReplayedOutput(
	terminal: ReplayTerminal,
	data: Uint8Array,
): void {
	if (data.byteLength === 0) return;
	const state = replayStateFor(terminal);
	let disabledBefore = false;
	terminal.write("", () => {
		disabledBefore = terminal.options.disableStdin ?? false;
		terminal.options.disableStdin = true;
		state.replaying = true;
	});
	terminal.write(data, () => {
		terminal.options.disableStdin = disabledBefore;
		state.replaying = false;
		for (const deliver of state.held.splice(0)) deliver();
	});
}
