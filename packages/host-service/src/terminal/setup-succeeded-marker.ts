const MARKER = "\x1b]777;superset-setup-succeeded\x07";
const MARKER_BYTES = Uint8Array.from([...MARKER].map((c) => c.charCodeAt(0)));

/**
 * Prints the marker as real ESC/BEL bytes. The typed command line echoes the
 * literal `\033` text instead, so the echo can never match.
 */
export const SETUP_SUCCEEDED_COMMAND =
	"printf '\\033]777;superset-setup-succeeded\\007'";

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
