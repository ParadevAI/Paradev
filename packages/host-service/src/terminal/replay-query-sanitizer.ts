/**
 * Terminal programs ask the emulator questions (cursor position, device
 * attributes, colours) and expect a reply. The host keeps those query bytes in
 * its catch-up ring, so a reattaching renderer replays them and its xterm
 * dutifully answers — into the PTY's input, at a shell prompt whose program is
 * long gone (#6698). The result is a burst of junk that looks like typing.
 *
 * A live query must still be answered, so only replayed bytes are sanitized.
 * Every matched byte is replaced with NUL, which xterm ignores: the payload
 * stays the same length, so the host's `outputSeq` arithmetic and the client's
 * anchor remain valid.
 */

// Built from a string because the linter forbids control characters in regex
// literals; the escapes below still compile to the same byte patterns.
const QUERY_SEQUENCE = new RegExp(
	"\\x1b\\[[0-9;?]*n|" +
		"\\x1b\\[(?:[>?][0-9;?]*)?c|" +
		"\\x1b\\[\\?[0-9;]*\\$p|" +
		"\\x1b\\[\\?[0-9;]*u|" +
		"\\x1b\\[>[0-9;]*q|" +
		"\\x1b\\[[0-9;]*\\$q|" +
		"\\x1b\\][0-9]+;\\?(?:\\x07|\\x1b\\\\)",
	"g",
);

/** Replace terminal query sequences with length-preserving NUL padding. */
export function sanitizeReplayedQueries(bytes: Uint8Array): Uint8Array {
	if (bytes.length === 0) return bytes;
	// Control sequences are ASCII, so latin1 maps each byte to one char and
	// regex indices stay byte offsets.
	const text = Buffer.from(bytes).toString("latin1");
	let sanitized: Uint8Array | null = null;
	for (const match of text.matchAll(QUERY_SEQUENCE)) {
		sanitized ??= Uint8Array.from(bytes);
		const start = match.index ?? 0;
		sanitized.fill(0, start, start + match[0].length);
	}
	return sanitized ?? bytes;
}
