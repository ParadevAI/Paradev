/**
 * Superset's shell wrappers print `OSC 777;superset-shell-exit` from the
 * shell's exit hook, so the marker is in the output only when the interactive
 * shell ended by itself (`exit`, `logout`, Ctrl+D) and not when a command
 * crashed or the PTY was killed.
 */
export const SHELL_EXIT_MARKER_PAYLOAD = "superset-shell-exit";
export const SHELL_EXIT_MARKER_SCRIPT = `\\033]777;${SHELL_EXIT_MARKER_PAYLOAD}\\007`;

const SHELL_EXIT_MARKER_BYTES = Uint8Array.from(
	[...`\x1b]777;${SHELL_EXIT_MARKER_PAYLOAD}\x07`].map((c) => c.charCodeAt(0)),
);

/** Other exit hooks can print after ours, so the marker is not always last. */
export const SHELL_EXIT_MARKER_TAIL_BYTES = 512;

export function containsShellExitMarker(tail: Uint8Array): boolean {
	const last = tail.length - SHELL_EXIT_MARKER_BYTES.length;
	for (let start = last; start >= 0; start--) {
		let matched = true;
		for (let i = 0; i < SHELL_EXIT_MARKER_BYTES.length; i++) {
			if (tail[start + i] !== SHELL_EXIT_MARKER_BYTES[i]) {
				matched = false;
				break;
			}
		}
		if (matched) return true;
	}
	return false;
}
