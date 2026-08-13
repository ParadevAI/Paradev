export const FOREGROUND = "#e5e5e5";
export const MUTED = "#8e8e93";

export const PILL_RADIUS = 26;

export interface TerminalQuickKey {
	id: string;
	/** Monospaced label; ignored when `symbol` is set. */
	label?: string;
	/** SF Symbol name (e.g. "arrow.up"). */
	symbol?: string;
	/** Raw bytes written into the PTY. */
	data: string;
}

// Escape/tab/arrow keys the soft keyboard doesn't have. The leading expander
// (`»`) reveals the wider set (ctrl, space, function keys) in a later pass.
export const QUICK_KEYS: TerminalQuickKey[] = [
	{ id: "esc", label: "esc", data: "\u001b" },
	{ id: "tab", label: "tab", data: "\t" },
	{ id: "shift-tab", label: "⇧tab", data: "\u001b[Z" },
	{ id: "up", symbol: "arrow.up", data: "\u001b[A" },
	{ id: "down", symbol: "arrow.down", data: "\u001b[B" },
	{ id: "left", symbol: "arrow.left", data: "\u001b[D" },
	{ id: "right", symbol: "arrow.right", data: "\u001b[C" },
	{ id: "ctrl-c", label: "^C", data: "\u0003" },
];
