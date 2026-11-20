import { TERMINAL_VERSION_NAME } from "@superset/shared/constants";

// tmux 3.8 asks the outer terminal for its identity on attach and gives up
// after five seconds. The desktop app used to answer only when a renderer
// parsed the bytes — a CLI-created terminal whose tab is still closed answers
// minutes late, and tmux then treats the reply as typed input. The daemon sees
// the PTY stream at the source, so it answers immediately and strips the query
// from delivered and replayed bytes; a renderer that attaches later cannot
// answer it a second time. Modelled on TerminalColors, which does the same for
// OSC colour queries.

const ESC = 0x1b;
const CSI_OPEN = 0x5b; // '['
const MAX_CSI_BYTES = 64;

type State = "ground" | "esc" | "csi";

export interface TerminalIdentityQueriesSnapshot {
	state: State;
	pending: number[];
}

/** Replies xterm.js would produce, kept byte-identical for tmux and agents. */
function identityReply(sequence: string): string | null {
	if (sequence === "\x1b[c") return "\x1b[?1;2c"; // DA1
	// A numeric parameter (e.g. `>0c`, `>0q`) is the same query to tmux and
	// xterm. Built with string checks so the linter's control-character rule
	// does not fight the literal ESC bytes.
	const parameterised = (final: string) =>
		sequence.startsWith("\x1b[>") &&
		sequence.endsWith(final) &&
		/^[0-9;]*$/.test(sequence.slice(3, -1));
	if (parameterised("c")) return "\x1b[>0;276;0c"; // DA2
	if (parameterised("q")) return `\x1bP>|${TERMINAL_VERSION_NAME}\x1b\\`; // XTVERSION
	if (sequence === "\x1b[?2026$p") return "\x1b[?2026;2$y"; // DECRQM sync
	return null;
}

export class TerminalIdentityQueries {
	private state: State = "ground";
	private pending: number[] = [];

	snapshot(): TerminalIdentityQueriesSnapshot {
		return { state: this.state, pending: [...this.pending] };
	}

	restore(snapshot: TerminalIdentityQueriesSnapshot): void {
		this.state = snapshot.state;
		this.pending = [...snapshot.pending];
	}

	/** Return incomplete bytes so a dying PTY cannot lose trailing output. */
	flush(): Buffer {
		const bytes = Buffer.from(this.pending);
		this.pending = [];
		this.state = "ground";
		return bytes;
	}

	feed(chunk: Buffer, reply: (bytes: Buffer) => void): Buffer {
		const output: Buffer[] = [];
		let start = 0;
		for (let i = 0; i < chunk.length; i++) {
			const byte = chunk[i] ?? 0;
			if (this.state === "ground") {
				if (byte === ESC) {
					output.push(chunk.subarray(start, i));
					this.pending = [byte];
					this.state = "esc";
					start = i + 1;
				}
				continue;
			}
			if (this.state === "esc") {
				if (byte === CSI_OPEN) {
					this.pending.push(byte);
					this.state = "csi";
					start = i + 1;
					continue;
				}
				// Not a CSI: release the ESC and reprocess this byte in ground.
				output.push(Buffer.from(this.pending));
				this.pending = [];
				this.state = "ground";
				i--;
				continue;
			}
			this.pending.push(byte);
			// The byte is now held in `pending`; never emit it again as tail.
			start = i + 1;
			if (byte >= 0x40 && byte <= 0x7e) {
				const answer = identityReply(
					Buffer.from(this.pending).toString("latin1"),
				);
				if (answer) reply(Buffer.from(answer, "latin1"));
				else output.push(Buffer.from(this.pending));
				this.pending = [];
				this.state = "ground";
				start = i + 1;
				continue;
			}
			if (byte === ESC || (byte < 0x20 && byte !== 0x18 && byte !== 0x1a)) {
				// Aborted sequence: release the bytes held so far. An ESC starts
				// a fresh escape; a control byte is ordinary output and must be
				// kept as well.
				output.push(
					Buffer.from(byte === ESC ? this.pending.slice(0, -1) : this.pending),
				);
				this.pending = byte === ESC ? [byte] : [];
				this.state = byte === ESC ? "esc" : "ground";
				continue;
			}
			if (this.pending.length > MAX_CSI_BYTES) {
				output.push(Buffer.from(this.pending));
				this.pending = [];
				this.state = "ground";
				start = i + 1;
			}
		}
		output.push(chunk.subarray(start));
		return output.length === 1
			? (output[0] ?? Buffer.alloc(0))
			: Buffer.concat(output);
	}
}
