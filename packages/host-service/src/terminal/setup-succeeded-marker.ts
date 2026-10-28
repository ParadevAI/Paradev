const MARKER = "\x1b]777;superset-setup-succeeded\x07";
const MARKER_BYTES = Uint8Array.from([...MARKER].map((c) => c.charCodeAt(0)));

/**
 * Prints the marker as real ESC/BEL bytes. The typed command line echoes the
 * literal `\033` text instead, so the echo can never match.
 */
export const SETUP_SUCCEEDED_COMMAND =
	"printf '\\033]777;superset-setup-succeeded\\007'";

const POSIX_SHELLS = new Set(["bash", "zsh", "sh", "dash", "ksh", "mksh"]);

/**
 * Prints the marker only when the whole setup exits 0. A multi-line command or
 * a `# comment` is grouped, and the group ends on its own line, so neither can
 * swallow the marker. The group opens on the first line to keep the echo probe
 * of a typed command printable.
 */
export function appendSetupSucceededMarker(
	command: string,
	shellName: string,
): string {
	const body = command.trimEnd();
	if (!/[\n#]/.test(body)) return `${body} && ${SETUP_SUCCEEDED_COMMAND}`;
	if (shellName === "fish") {
		return `begin; ${body}\nend && ${SETUP_SUCCEEDED_COMMAND}`;
	}
	if (POSIX_SHELLS.has(shellName)) {
		return `{ ${body}\n} && ${SETUP_SUCCEEDED_COMMAND}`;
	}
	return `${body} && ${SETUP_SUCCEEDED_COMMAND}`;
}

/** Returns a scanner that reports true once the marker is seen, also when it spans chunks. */
export function createSetupSucceededScanner(): (chunk: Uint8Array) => boolean {
	let matched = 0;
	return (chunk) => {
		for (const byte of chunk) {
			if (byte === MARKER_BYTES[matched]) {
				matched++;
				if (matched === MARKER_BYTES.length) return true;
			} else {
				matched = byte === MARKER_BYTES[0] ? 1 : 0;
			}
		}
		return false;
	};
}
