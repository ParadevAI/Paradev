// Queries a terminal answers, from the specs. Each answered one is checked
// against the real runtime (createRuntime: same options, addons and handlers
// as the app): replayed it sends nothing, live it sends exactly one reply.
//   xterm ctlseqs:  https://invisible-island.net/xterm/ctlseqs/ctlseqs.html
//   kitty keyboard: https://sw.kovidgoyal.net/kitty/keyboard-protocol/#progressive-enhancement
//   kitty graphics: https://sw.kovidgoyal.net/kitty/graphics-protocol/#querying-support-and-available-transmission-mediums
//                   https://sw.kovidgoyal.net/kitty/graphics-protocol/#suppressing-responses-from-the-terminal
//   iTerm2:         https://iterm2.com/documentation-escape-codes.html (Report Cell Size, Report Variable)
//   color scheme:   https://contour-terminal.org/vt-extensions/color-palette-update-notifications/
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { Terminal } from "@xterm/xterm";

const ESC = "\x1b";
const ST = `${ESC}\\`;
const CTLSEQS = "https://invisible-island.net/xterm/ctlseqs/ctlseqs.html";
const KITTY_GRAPHICS = "https://sw.kovidgoyal.net/kitty/graphics-protocol/";

const canvases = [globalThis.HTMLCanvasElement, globalThis.OffscreenCanvas]
	.filter(Boolean)
	.map((canvas) => ({
		prototype: canvas.prototype,
		descriptor: Object.getOwnPropertyDescriptor(canvas.prototype, "getContext"),
	}));
const bitmapDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"createImageBitmap",
);
let decodeImage: () => Promise<unknown> = async () => ({
	width: 8,
	height: 16,
	close() {},
});

beforeAll(() => {
	for (const { prototype } of canvases) {
		Object.defineProperty(prototype, "getContext", {
			configurable: true,
			value(this: HTMLCanvasElement) {
				return {
					canvas: this,
					font: "",
					measureText: () => ({ width: 7 }),
					fillRect() {},
					clearRect() {},
					drawImage() {},
					putImageData() {},
					getImageData: () => ({ data: new Uint8ClampedArray(4) }),
					createImageData: (width: number, height: number) => ({
						data: new Uint8ClampedArray(width * height * 4),
						width,
						height,
					}),
					save() {},
					restore() {},
					scale() {},
					setTransform() {},
				};
			},
		});
	}
	Object.defineProperty(globalThis, "createImageBitmap", {
		configurable: true,
		value: () => decodeImage(),
	});
});

afterAll(() => {
	for (const { prototype, descriptor } of canvases) {
		if (descriptor) Object.defineProperty(prototype, "getContext", descriptor);
		else delete (prototype as { getContext?: unknown }).getContext;
	}
	if (bitmapDescriptor) {
		Object.defineProperty(globalThis, "createImageBitmap", bitmapDescriptor);
	} else {
		delete (globalThis as { createImageBitmap?: unknown }).createImageBitmap;
	}
});

const { createRuntime, disposeRuntime } = await import("./terminal-runtime");
const { getDefaultTerminalAppearance } = await import("./appearance");
const { writeReplayedOutput } = await import("./terminal-replay-write");
const { TERMINAL_VERSION_NAME } = await import("./terminal-version-reply");

const encoder = new TextEncoder();
const theme = getDefaultTerminalAppearance().theme;
const rgb = (hex: string | undefined) =>
	`rgb:${[1, 3, 5].map((i) => (hex ?? "").slice(i, i + 2).repeat(2)).join("/")}`;
const CLIPBOARD_TEXT = "copied";

let runtimes = 0;
async function setup() {
	const runtime = createRuntime(
		`replay-spec-${++runtimes}`,
		getDefaultTerminalAppearance(),
		{ initialBuffer: "" },
	);
	document.body.appendChild(runtime.wrapper);
	const terminal = runtime.terminal;
	const sent: string[] = [];
	terminal.onData((data) => sent.push(data));
	terminal.onBinary((data) => sent.push(data));
	const parsed = () =>
		new Promise<void>((resolve) => terminal.write("", resolve));
	await parsed();
	const dispose = () => {
		runtime.wrapper.remove();
		disposeRuntime(runtime, { persistedState: "clear" });
	};
	return { terminal, sent, parsed, dispose };
}

function replay(terminal: Terminal, data: string) {
	writeReplayedOutput(terminal, encoder.encode(data));
}

const cursorReport = (prefix: string) => (terminal: Terminal) => {
	const { cursorX, cursorY } = terminal.buffer.active;
	return `${ESC}[${prefix}${cursorY + 1};${cursorX + 1}R`;
};

interface Query {
	name: string;
	spec: string;
	query: string;
	/** The reply this app's xterm sends live, measured; null when it sends none. */
	reply: ((terminal: Terminal) => string) | null;
}

const QUERIES: Query[] = [
	{
		name: "DA1",
		spec: `${CTLSEQS} CSI Ps c`,
		query: `${ESC}[c`,
		reply: () => `${ESC}[?62;4;9;22c`,
	},
	{
		name: "DA1, 8-bit CSI",
		spec: `${CTLSEQS} C1 (8-Bit) Control Characters`,
		query: "\u009bc",
		reply: () => `${ESC}[?62;4;9;22c`,
	},
	{
		name: "DA2",
		spec: `${CTLSEQS} CSI > Ps c`,
		query: `${ESC}[>c`,
		reply: () => `${ESC}[>0;276;0c`,
	},
	{
		name: "DA3",
		spec: `${CTLSEQS} CSI = Ps c`,
		query: `${ESC}[=c`,
		reply: null,
	},
	{
		name: "DSR status",
		spec: `${CTLSEQS} CSI Ps n`,
		query: `${ESC}[5n`,
		reply: () => `${ESC}[0n`,
	},
	{
		name: "DSR CPR",
		spec: `${CTLSEQS} CSI Ps n`,
		query: `${ESC}[6n`,
		reply: cursorReport(""),
	},
	{
		name: "DSR CPR, 8-bit CSI",
		spec: `${CTLSEQS} C1 (8-Bit) Control Characters`,
		query: "\u009b6n",
		reply: cursorReport(""),
	},
	{
		name: "DECXCPR",
		spec: `${CTLSEQS} CSI ? Ps n`,
		query: `${ESC}[?6n`,
		reply: cursorReport("?"),
	},
	{
		name: "DSR printer",
		spec: `${CTLSEQS} CSI ? Ps n`,
		query: `${ESC}[?15n`,
		reply: null,
	},
	{
		name: "color scheme",
		spec: "contour color-palette-update-notifications",
		query: `${ESC}[?996n`,
		reply: () => `${ESC}[?997;1n`,
	},
	{
		name: "DECRQM ANSI",
		spec: `${CTLSEQS} CSI Ps $ p`,
		query: `${ESC}[4$p`,
		reply: () => `${ESC}[4;2$y`,
	},
	{
		name: "DECRQM DEC",
		spec: `${CTLSEQS} CSI ? Ps $ p`,
		query: `${ESC}[?2004$p`,
		reply: () => `${ESC}[?2004;2$y`,
	},
	{
		name: "DECRQSS",
		spec: `${CTLSEQS} DCS $ q Pt ST`,
		query: `${ESC}P$qm${ST}`,
		reply: () => `${ESC}P1$r0m${ST}`,
	},
	{
		name: "DECRQSS, 8-bit DCS and ST",
		spec: `${CTLSEQS} C1 (8-Bit) Control Characters`,
		query: "\u0090$qm\u009c",
		reply: () => `${ESC}P1$r0m${ST}`,
	},
	{
		name: "XTVERSION",
		spec: `${CTLSEQS} CSI > Ps q`,
		query: `${ESC}[>q`,
		reply: () => `${ESC}P>|${TERMINAL_VERSION_NAME}${ST}`,
	},
	{
		name: "XTWINOPS 11",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[11t`,
		reply: null,
	},
	{
		name: "XTWINOPS 13",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[13t`,
		reply: null,
	},
	{
		name: "XTWINOPS 14",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[14t`,
		reply: () => `${ESC}[4;0;0t`,
	},
	{
		name: "XTWINOPS 14;2",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[14;2t`,
		reply: null,
	},
	{
		name: "XTWINOPS 15",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[15t`,
		reply: null,
	},
	{
		name: "XTWINOPS 16",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[16t`,
		reply: () => `${ESC}[6;0;0t`,
	},
	{
		name: "XTWINOPS 18",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[18t`,
		reply: (t) => `${ESC}[8;${t.rows};${t.cols}t`,
	},
	{
		name: "XTWINOPS 19",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[19t`,
		reply: null,
	},
	{
		name: "XTWINOPS 20",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[20t`,
		reply: null,
	},
	{
		name: "XTWINOPS 21",
		spec: `${CTLSEQS} CSI Ps ; Ps ; Ps t`,
		query: `${ESC}[21t`,
		reply: null,
	},
	{
		name: "XTGETTCAP",
		spec: `${CTLSEQS} DCS + q Pt ST`,
		query: `${ESC}P+q544e${ST}`,
		reply: null,
	},
	{
		name: "XTSMGRAPHICS colors",
		spec: `${CTLSEQS} CSI ? Pi ; Pa ; Pv S`,
		query: `${ESC}[?1;1S`,
		reply: () => `${ESC}[?1;0;4096S`,
	},
	{
		name: "XTSMGRAPHICS sixel geometry",
		spec: `${CTLSEQS} CSI ? Pi ; Pa ; Pv S`,
		query: `${ESC}[?2;1S`,
		reply: (t) => `${ESC}[?2;0;${t.cols * 7};${t.rows * 14}S`,
	},
	{
		name: "DECRQCRA",
		spec: `${CTLSEQS} CSI Pi ; Pg ; Pt ; Pl ; Pb ; Pr * y`,
		query: `${ESC}[1;1;1;1;1;1*y`,
		reply: null,
	},
	{
		name: "OSC 4 color, BEL",
		spec: `${CTLSEQS} OSC Ps ; Pt BEL`,
		query: `${ESC}]4;1;?\x07`,
		reply: () => `${ESC}]4;1;${rgb(theme.red)}${ST}`,
	},
	{
		name: "OSC 10 foreground, ST",
		spec: `${CTLSEQS} OSC Ps ; Pt ST`,
		query: `${ESC}]10;?${ST}`,
		reply: () => `${ESC}]10;${rgb(theme.foreground)}${ST}`,
	},
	{
		name: "OSC 11 background, 8-bit OSC and ST",
		spec: `${CTLSEQS} C1 (8-Bit) Control Characters`,
		query: "\u009d11;?\u009c",
		reply: () => `${ESC}]11;${rgb(theme.background)}${ST}`,
	},
	{
		name: "OSC 12 cursor",
		spec: `${CTLSEQS} OSC Ps ; Pt BEL`,
		query: `${ESC}]12;?\x07`,
		reply: () => `${ESC}]12;${rgb(theme.cursor)}${ST}`,
	},
	{
		name: "OSC 52 read",
		spec: `${CTLSEQS} OSC 52`,
		query: `${ESC}]52;c;?\x07`,
		reply: () => `${ESC}]52;c;${btoa(CLIPBOARD_TEXT)}\x07`,
	},
	{
		name: "iTerm2 ReportCellSize",
		spec: "iTerm2 Report Cell Size",
		query: `${ESC}]1337;ReportCellSize\x07`,
		reply: () => `${ESC}]1337;ReportCellSize=0.000;0.000;1.000${ST}`,
	},
	{
		name: "iTerm2 ReportVariable",
		spec: "iTerm2 Report Variable",
		query: `${ESC}]1337;ReportVariable=dXNlcg==\x07`,
		reply: null,
	},
	{
		name: "kitty keyboard flags",
		spec: "kitty keyboard #progressive-enhancement",
		query: `${ESC}[?u`,
		reply: () => `${ESC}[?0u`,
	},
	{
		name: "kitty graphics a=q",
		spec: `${KITTY_GRAPHICS}#querying-support-and-available-transmission-mediums`,
		query: `${ESC}_Gi=31,s=1,v=1,a=q,t=d,f=24;AAAA${ST}`,
		reply: () => `${ESC}_Gi=31;OK${ST}`,
	},
	{
		name: "kitty graphics transmit with id",
		spec: `${KITTY_GRAPHICS}#suppressing-responses-from-the-terminal`,
		query: `${ESC}_Gi=32,a=T,f=24,s=1,v=1;AAAA${ST}`,
		reply: () => `${ESC}_Gi=32;OK${ST}`,
	},
	{
		name: "kitty graphics transmit, q=1",
		spec: `${KITTY_GRAPHICS}#suppressing-responses-from-the-terminal`,
		query: `${ESC}_Gi=33,a=T,f=24,s=1,v=1,q=1;AAAA${ST}`,
		reply: null,
	},
	{
		name: "kitty graphics transmit, q=2",
		spec: `${KITTY_GRAPHICS}#suppressing-responses-from-the-terminal`,
		query: `${ESC}_Gi=34,a=T,f=24,s=1,v=1,q=2;AAAA${ST}`,
		reply: null,
	},
	{
		name: "ENQ",
		spec: `${CTLSEQS} Single-character functions`,
		query: "\x05",
		reply: null,
	},
	{
		name: "DECREQTPARM",
		spec: `${CTLSEQS} CSI Ps x`,
		query: `${ESC}[x`,
		reply: null,
	},
];

const ANSWERED = QUERIES.filter((query) => query.reply !== null);
const UNANSWERED = QUERIES.filter((query) => query.reply === null);
const ALL_ANSWERED = ANSWERED.map((query) => query.query).join("");

beforeAll(async () => {
	await navigator.clipboard.writeText(CLIPBOARD_TEXT);
});

describe("queries from the specs", () => {
	test.each(
		ANSWERED,
	)("$name: live after a replay, exactly one reply", async (query) => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, ALL_ANSWERED);
		await parsed();
		const reply = query.reply?.(terminal) ?? "";
		terminal.write(query.query);
		await parsed();
		expect(sent).toEqual([reply]);
		dispose();
	});

	test.each(ANSWERED)("$name: replayed, nothing sent", async (query) => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, query.query);
		await parsed();
		expect(sent).toEqual([]);
		expect(terminal.options.disableStdin).toBe(false);
		dispose();
	});

	test.each(UNANSWERED)("$name: no reply, replayed or live", async (query) => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, `${ALL_ANSWERED}${query.query}`);
		terminal.write(query.query);
		await parsed();
		expect(sent).toEqual([]);
		dispose();
	});
});

describe("replay edges", () => {
	test("a query split across two replayed chunks is not answered", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, `${ESC}[1`);
		replay(terminal, `8t${ESC}]52;c`);
		replay(terminal, `;?\x07${ESC}[`);
		replay(terminal, "c");
		await parsed();
		expect(sent).toEqual([]);
		dispose();
	});

	test("a query that ends in live bytes is answered once", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, `${ESC}[c${ESC}[1`);
		terminal.write("8t");
		await parsed();
		expect(sent).toEqual([`${ESC}[8;${terminal.rows};${terminal.cols}t`]);
		dispose();
	});

	test("live bytes after the replay in the same frame are answered", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		const frame = encoder.encode(`${ALL_ANSWERED}${ESC}[5n`);
		const head = frame.length - 4;
		writeReplayedOutput(terminal, frame.subarray(0, head));
		terminal.write(frame.subarray(head));
		await parsed();
		expect(sent).toEqual([`${ESC}[0n`]);
		dispose();
	});

	test("an empty replay changes nothing", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, ALL_ANSWERED);
		writeReplayedOutput(terminal, new Uint8Array(0));
		terminal.write(`${ESC}[c`);
		await parsed();
		expect(sent).toEqual([`${ESC}[?62;4;9;22c`]);
		expect(terminal.options.disableStdin).toBe(false);
		dispose();
	});

	test("two replays in a row send nothing, then live queries are answered", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, ALL_ANSWERED);
		await parsed();
		replay(terminal, ALL_ANSWERED);
		await parsed();
		expect(sent).toEqual([]);
		terminal.write(`${ESC}[c`);
		await parsed();
		expect(sent).toEqual([`${ESC}[?62;4;9;22c`]);
		dispose();
	});

	test("a replay queued behind a pending replay sends nothing", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, ALL_ANSWERED);
		replay(terminal, ALL_ANSWERED);
		terminal.write(`${ESC}[5n`);
		await parsed();
		expect(sent).toEqual([`${ESC}[0n`]);
		expect(terminal.options.disableStdin).toBe(false);
		dispose();
	});

	test("a live query written while the replay is still pending is answered once", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, ALL_ANSWERED);
		terminal.write(`${ESC}[>c`);
		replay(terminal, ALL_ANSWERED);
		await parsed();
		expect(sent).toEqual([`${ESC}[>0;276;0c`]);
		dispose();
	});

	test("unterminated sequences at the end of a replay do not swallow live bytes", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, `${ESC}[c${ESC}]0;title`);
		terminal.write(`${ST}${ESC}[c`);
		replay(terminal, `${ESC}P$q`);
		terminal.write(`\x18${ESC}[5n`);
		await parsed();
		expect(sent).toEqual([`${ESC}[?62;4;9;22c`, `${ESC}[0n`]);
		dispose();
	});

	test("a ring-sized replay sends nothing and later queries are answered", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		const block = `${"x".repeat(4000)}\r\n${ALL_ANSWERED}`;
		const ring = block.repeat(Math.ceil((2 * 1024 * 1024) / block.length));
		replay(terminal, ring);
		terminal.write(`${ESC}[c`);
		await parsed();
		expect(sent).toEqual([`${ESC}[?62;4;9;22c`]);
		dispose();
	});
});

describe("input during a replay", () => {
	function keyDown(terminal: Terminal, key: string, keyCode: number) {
		terminal.textarea?.dispatchEvent(
			new KeyboardEvent("keydown", {
				key,
				keyCode,
				bubbles: true,
				cancelable: true,
			}),
		);
	}

	function pasteText(terminal: Terminal, text: string) {
		const clipboardData = new DataTransfer();
		clipboardData.setData("text/plain", text);
		terminal.textarea?.dispatchEvent(
			new ClipboardEvent("paste", {
				clipboardData,
				bubbles: true,
				cancelable: true,
			}),
		);
	}

	async function withPendingDecode(
		run: (release: () => void) => Promise<void>,
	): Promise<void> {
		const previous = decodeImage;
		const pending: (() => void)[] = [];
		let released = false;
		decodeImage = () => {
			const decoded = previous();
			if (released) return decoded;
			return new Promise((resolve) => pending.push(() => resolve(decoded)));
		};
		const release = () => {
			released = true;
			for (const resolve of pending.splice(0)) resolve();
		};
		try {
			await run(release);
		} finally {
			release();
			decodeImage = previous;
		}
	}

	test("keys typed before the replay is parsed arrive once, in order", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, ALL_ANSWERED);
		keyDown(terminal, "a", 65);
		keyDown(terminal, "Enter", 13);
		await parsed();
		keyDown(terminal, "b", 66);
		expect(sent).toEqual(["a", "\r", "b"]);
		dispose();
	});

	test("keys and paste while a replayed image decodes arrive once, in order, after it", async () => {
		await withPendingDecode(async (release) => {
			const { terminal, sent, parsed, dispose } = await setup();
			replay(
				terminal,
				`${ESC}_Gi=40,a=T,f=24,s=1,v=1;AAAA${ST}${ALL_ANSWERED}`,
			);
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(terminal.options.disableStdin).toBe(true);
			keyDown(terminal, "x", 88);
			pasteText(terminal, "pasted");
			keyDown(terminal, "Enter", 13);
			expect(sent).toEqual([]);
			release();
			await parsed();
			expect(sent).toEqual(["x", "pasted", "\r"]);
			expect(terminal.options.disableStdin).toBe(false);
			dispose();
		});
	});

	test("a replayed image still draws and its OK is not sent", async () => {
		const live = await setup();
		live.terminal.write(`${ESC}_Gi=41,a=T,f=24,s=1,v=1;AAAA${ST}`);
		await live.parsed();
		const replayed = await setup();
		replay(replayed.terminal, `${ESC}_Gi=41,a=T,f=24,s=1,v=1;AAAA${ST}`);
		await replayed.parsed();
		expect(live.sent).toEqual([`${ESC}_Gi=41;OK${ST}`]);
		expect(replayed.sent).toEqual([]);
		expect(replayed.terminal.buffer.active.cursorY).toBe(1);
		expect(replayed.terminal.buffer.active.cursorY).toBe(
			live.terminal.buffer.active.cursorY,
		);
		live.dispose();
		replayed.dispose();
	});

	test("focus reports stay live after a replay turned them on", async () => {
		const { terminal, sent, parsed, dispose } = await setup();
		replay(terminal, `${ESC}[?1004h${ALL_ANSWERED}`);
		await parsed();
		terminal.focus();
		terminal.blur();
		expect(sent).toEqual([`${ESC}[I`, `${ESC}[O`]);
		dispose();
	});
});

describe("clipboard during a replay", () => {
	test("a replayed OSC 52 copy leaves the clipboard alone, a live one copies", async () => {
		const { terminal, parsed, dispose } = await setup();
		replay(terminal, `${ESC}]52;c;${btoa("stale")}\x07`);
		await parsed();
		expect(await navigator.clipboard.readText()).toBe(CLIPBOARD_TEXT);
		const hasFocus = document.hasFocus;
		document.hasFocus = () => true;
		try {
			terminal.write(`${ESC}]52;c;${btoa("fresh")}\x07`);
			await parsed();
			expect(await navigator.clipboard.readText()).toBe("fresh");
		} finally {
			document.hasFocus = hasFocus;
			await navigator.clipboard.writeText(CLIPBOARD_TEXT);
			dispose();
		}
	});
});
