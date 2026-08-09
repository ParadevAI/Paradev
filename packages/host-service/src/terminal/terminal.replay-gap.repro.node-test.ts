// Regression test for the "TUI artifacts until resize" bug
// (fix-tui-resize-artifacts).
//
// The terminal wire protocol is at-most-once: half-open sockets (sleep/wake)
// and back-pressure drops lose output bytes without the host knowing. A TUI
// that repaints incrementally in the normal buffer (Claude Code) relies on
// the terminal grid containing exactly what it last drew — a lost byte range
// left permanent ghost content (a stranded copy of the old input box) that
// only a real dimension change could clear, because a same-dims resize
// produces no SIGWINCH.
//
// The fix: every attach sends a grid resync — full reset + the ModeTracker's
// serialized buffer + mode preamble — so a reattaching renderer converges on
// the emulator's authoritative state no matter how much output it missed.
// This test detaches, streams far more output than any bounded replay could
// hold (ending in a shrunken repaint region, the shape that used to strand
// ghosts), reattaches, and asserts the grids are identical with no resize.
//
// Harness: real in-process pty-daemon, real bash PTY running a scripted
// incremental-repaint TUI (Ink-style: cursor-up + erase + redraw of a bottom
// box whose height varies), the real host-service WS route, and a real
// @xterm/headless instance standing in for the renderer's grid. Ground truth
// is the session's own ModeTracker (fed every byte). The renderer stand-in is
// synthetic; the transport, resync, and PTY layers are the real code.
//
// Run:
//   cd packages/host-service && node --experimental-strip-types --test \
//     src/terminal/terminal.replay-gap.repro.node-test.ts

import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Server } from "@superset/pty-daemon";
import { Hono } from "hono";
import { createDb, type HostDb } from "../db/index.ts";
import { projects, workspaces } from "../db/schema.ts";
import type { EventBus } from "../events/index.ts";
import { disposeDaemonClient } from "./daemon-client-singleton.ts";
import { initTerminalBaseEnv } from "./env.ts";
import {
	__resetSessionsForTesting,
	createTerminalSessionInternal,
	disposeSessionAndWait,
	registerWorkspaceTerminalRoute,
	snapshotSession,
	writeInputToSession,
} from "./terminal.ts";
import { __setAccountShellForTesting } from "./user-shell.ts";

const require = (await import("node:module")).createRequire(import.meta.url);
const { Terminal: HeadlessTerminal } =
	require("@xterm/headless") as typeof import("@xterm/headless");
type Headless = InstanceType<typeof HeadlessTerminal>;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_HOME = path.join(os.tmpdir(), `host-svc-replaygap-${process.pid}`);
const SOCK = path.join(os.tmpdir(), `host-svc-replaygap-${process.pid}.sock`);
const MIGRATIONS = path.resolve(__dirname, "../../drizzle");

const COLS = 80;
const ROWS = 24;

let server: Server;
let db: HostDb;
let workspaceId: string;
let httpPort: number;
let httpServer: ReturnType<typeof serve>;

// Ink-style incremental-repaint TUI. Owns a bottom "input box" whose height
// alternates (3 vs 6 rows). Each frame moves the cursor up over its own
// region, erases to end of screen, prints one transcript line, and redraws
// the box — all cursor-relative, exactly like Ink's log-update rendering.
// On SIGWINCH it clears the screen and repaints fully, like Ink on resize.
const TUI_SCRIPT = String.raw`
stty -echo
frame=0
H=3
FILLER='................................................'
draw_box() {
  bh=$1
  printf '+==================================+\n'
  i=1
  while [ "$i" -le "$((bh - 2))" ]; do
    printf '| INPUT %06d line %d              |\n' "$frame" "$i"
    i=$((i + 1))
  done
  printf '+==================================+'
}
on_winch() {
  printf '\033[2J\033[H'
  printf 'FULL-REDRAW at frame %06d\n' "$frame"
  draw_box "$H"
}
trap on_winch WINCH
frames() {
  n=$1
  k=0
  while [ "$k" -lt "$n" ]; do
    frame=$((frame + 1))
    if [ "$(((frame / 7) % 2))" -eq 0 ]; then newH=3; else newH=6; fi
    printf '\r\033[%dA\033[0J' "$((H - 1))"
    printf 'transcript %06d %s\n' "$frame" "$FILLER"
    draw_box "$newH"
    H=$newH
    k=$((k + 1))
  done
}
# Spinner-style repaint: rewrite only the box region, no transcript, no scroll.
ticks() {
  n=$1
  k=0
  while [ "$k" -lt "$n" ]; do
    frame=$((frame + 1))
    printf '\r\033[%dA\033[0J' "$((H - 1))"
    draw_box "$H"
    k=$((k + 1))
  done
}
# The app resizes its own region (erases the old extent, draws the new one).
setH() {
  printf '\r\033[%dA\033[0J' "$((H - 1))"
  H=$1
  draw_box "$H"
}
printf '\033[2J\033[H'
printf 'TUI READY\n'
draw_box "$H"
while :; do
  IFS= read -r cmd || { sleep 0.02; continue; }
  set -- $cmd
  case $1 in
    frames) frames "$2" ;;
    ticks) ticks "$2" ;;
    setH) setH "$2" ;;
    quit) exit 0 ;;
  esac
done
`;

function progress(msg: string): void {
	process.stderr.write(`[repro] ${msg}\n`);
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(
	fn: () => boolean | Promise<boolean>,
	timeoutMs: number,
	label: string,
): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await fn()) return;
		await sleep(50);
	}
	throw new Error(`Timed out waiting for: ${label}`);
}

/** Last `rows` grid rows, right-trimmed, trailing blank rows dropped — the
 * same extraction ModeTracker.snapshot(maxLines) uses. */
function visibleText(term: Headless): string {
	const buf = term.buffer.active;
	const start = Math.max(0, buf.length - term.rows);
	const lines: string[] = [];
	for (let y = start; y < buf.length; y++) {
		lines.push(buf.getLine(y)?.translateToString(true) ?? "");
	}
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines.join("\n");
}

/** Ground truth: what the app actually drew, per the session's ModeTracker
 * (fed every PTY byte regardless of socket state). */
async function trackerVisible(terminalId: string): Promise<string> {
	const snap = await snapshotSession({
		terminalId,
		workspaceId,
		maxLines: ROWS,
		db,
	});
	assert.ok(!("error" in snap), `snapshot failed: ${JSON.stringify(snap)}`);
	if ("error" in snap) throw new Error("unreachable");
	return snap.text;
}

/**
 * The renderer stand-in: a real WebSocket client feeding a real xterm parser,
 * mirroring terminal-ws-transport.ts behavior (binary frames → xterm.write,
 * resize sent on "attached", same-URL reconnects).
 */
class RendererStandIn {
	term: Headless;
	private ws: WebSocket | null = null;
	private writeChain: Promise<void> = Promise.resolve();

	constructor() {
		this.term = new HeadlessTerminal({
			cols: COLS,
			rows: ROWS,
			scrollback: 1000,
			allowProposedApi: true,
		});
	}

	connect(terminalId: string): Promise<void> {
		return new Promise((resolve, reject) => {
			const ws = new WebSocket(
				`ws://127.0.0.1:${httpPort}/terminal/${terminalId}`,
			);
			ws.binaryType = "arraybuffer";
			this.ws = ws;
			const timer = setTimeout(
				() => reject(new Error("attach timeout")),
				10_000,
			);
			ws.addEventListener("message", (event) => {
				const data = (event as MessageEvent).data;
				if (data instanceof ArrayBuffer) {
					const bytes = new Uint8Array(data);
					this.writeChain = this.writeChain.then(
						() => new Promise<void>((r) => this.term.write(bytes, r)),
					);
					return;
				}
				const message = JSON.parse(String(data)) as { type: string };
				if (message.type === "attached") {
					// Mirrors terminal-ws-transport.ts: resize sent on every attach
					// with the renderer's current (often unchanged) dimensions.
					this.sendResize(this.term.cols, this.term.rows);
					clearTimeout(timer);
					resolve();
				}
			});
			ws.addEventListener("error", () => {
				clearTimeout(timer);
				reject(new Error("ws error during connect"));
			});
		});
	}

	sendResize(cols: number, rows: number): void {
		this.ws?.send(JSON.stringify({ type: "resize", cols, rows }));
	}

	disconnect(): Promise<void> {
		return new Promise((resolve) => {
			const ws = this.ws;
			this.ws = null;
			if (!ws || ws.readyState === WebSocket.CLOSED) return resolve();
			ws.addEventListener("close", () => resolve());
			ws.close();
		});
	}

	async drain(): Promise<void> {
		await this.writeChain;
	}

	async waitForFrame(frame: number, timeoutMs = 10_000): Promise<void> {
		const marker = `INPUT ${String(frame).padStart(6, "0")}`;
		await waitFor(
			async () => {
				await this.drain();
				return visibleText(this.term).includes(marker);
			},
			timeoutMs,
			`renderer to show frame ${frame}`,
		);
	}
}

async function waitForTrackerFrame(
	terminalId: string,
	frame: number,
	timeoutMs = 15_000,
): Promise<void> {
	const marker = `INPUT ${String(frame).padStart(6, "0")}`;
	await waitFor(
		async () => (await trackerVisible(terminalId)).includes(marker),
		timeoutMs,
		`tracker to show frame ${frame}`,
	);
}

function sendCommand(terminalId: string, command: string): void {
	const result = writeInputToSession({
		terminalId,
		workspaceId,
		data: `${command}\n`,
	});
	assert.ok(!("error" in result), JSON.stringify(result));
}

function runFrames(terminalId: string, count: number): void {
	sendCommand(terminalId, `frames ${count}`);
}

function gridDiff(expected: string, actual: string): string {
	const exp = expected.split("\n");
	const act = actual.split("\n");
	const out: string[] = [];
	const max = Math.max(exp.length, act.length);
	for (let i = 0; i < max; i++) {
		const e = exp[i] ?? "<missing>";
		const a = act[i] ?? "<missing>";
		out.push(e === a ? `  ${a}` : `- ${e}\n+ ${a}`);
	}
	return out.join("\n");
}

before(async () => {
	fs.mkdirSync(TEST_HOME, { recursive: true });
	const worktreePath = path.join(TEST_HOME, "worktree");
	fs.mkdirSync(worktreePath, { recursive: true });
	fs.writeFileSync(path.join(TEST_HOME, "tui.sh"), TUI_SCRIPT);

	server = new Server({
		socketPath: SOCK,
		daemonVersion: "0.0.0-replaygap-repro",
	});
	await server.listen();

	process.env.SUPERSET_PTY_DAEMON_SOCKET = SOCK;
	process.env.SUPERSET_HOME_DIR = TEST_HOME;
	process.env.HOST_SERVICE_VERSION = "0.0.0-replaygap-repro";
	process.env.NODE_ENV = "development";

	__setAccountShellForTesting("/bin/sh");
	initTerminalBaseEnv({
		PATH: process.env.PATH ?? "/usr/bin:/bin",
		HOME: process.env.HOME ?? TEST_HOME,
		SHELL: "/bin/sh",
	});

	db = createDb(path.join(TEST_HOME, "host.db"), MIGRATIONS);

	const projectId = randomUUID();
	workspaceId = randomUUID();
	db.insert(projects).values({ id: projectId, repoPath: worktreePath }).run();
	db.insert(workspaces)
		.values({ id: workspaceId, projectId, worktreePath, branch: "main" })
		.run();

	const app = new Hono();
	const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });
	registerWorkspaceTerminalRoute({
		app,
		db,
		// Only used for optional lifecycle broadcasts; not exercised here.
		eventBus: undefined as unknown as EventBus,
		upgradeWebSocket,
	});
	httpPort = await new Promise<number>((resolve) => {
		httpServer = serve(
			{ fetch: app.fetch, port: 0, hostname: "127.0.0.1" },
			(info) => resolve(info.port),
		);
	});
	injectWebSocket(httpServer);
});

after(async () => {
	__resetSessionsForTesting();
	__setAccountShellForTesting(undefined);
	await disposeDaemonClient();
	await server.close();
	await new Promise<void>((resolve) => httpServer.close(() => resolve()));
	try {
		fs.rmSync(TEST_HOME, { recursive: true, force: true });
	} catch {
		// best-effort
	}
});

test(
	"reattach resyncs the grid after any output gap — no artifacts, no resize needed",
	{ timeout: 180_000 },
	async () => {
		progress("test start");
		const terminalId = `repro-gap-${randomUUID().slice(0, 8)}`;
		const session = await createTerminalSessionInternal({
			terminalId,
			workspaceId,
			db,
			listed: true,
			cols: COLS,
			rows: ROWS,
			initialCommand: `exec bash '${path.join(TEST_HOME, "tui.sh")}'`,
		});
		if ("error" in session) assert.fail(session.error);

		progress("session created");
		const renderer = new RendererStandIn();
		// Optional grid dump for visual reporting (REPLAYGAP_EVIDENCE_PATH).
		const evidence: Record<string, unknown> = {};
		try {
			await renderer.connect(terminalId);
			progress("renderer attached");

			// ── Phase 0/1: attached streaming keeps the grids identical ──────────────
			await waitForTrackerFrame(terminalId, 0, 15_000).catch(() => {});
			await waitFor(
				async () => (await trackerVisible(terminalId)).includes("TUI READY"),
				15_000,
				"TUI to boot",
			);
			progress("TUI booted");
			let totalFrames = 20;
			runFrames(terminalId, 20);
			// Grow the region to 6 rows while attached — both grids see it. This is the
			// tall spinner/input state the renderer will be stranded on during the gap.
			sendCommand(terminalId, "setH 6");
			await waitForTrackerFrame(terminalId, totalFrames);
			await renderer.waitForFrame(totalFrames);
			await sleep(200);
			await renderer.drain();
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"harness fidelity: attached grids must match",
			);
			progress("PHASE 1 done");
			console.log("PHASE 1 attached streaming: grids identical ✓");

			// ── Phase 2: short detach, then reattach resyncs the grid ────────────────
			await renderer.disconnect();
			await sleep(300); // let the route's onClose detach the socket server-side
			sendCommand(terminalId, "ticks 60"); // a small detached burst
			totalFrames += 60;
			await waitForTrackerFrame(terminalId, totalFrames);
			await renderer.connect(terminalId);
			await renderer.waitForFrame(totalFrames);
			await sleep(200);
			await renderer.drain();
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"short detached output must be resynced on reattach",
			);
			progress("PHASE 2 done");
			console.log(
				"PHASE 2 short detach: resynced on reattach, grids identical ✓",
			);

			// ── Phase 3: long detach, way past any bounded replay, then reattach ─────
			// While detached, the app scrolls some transcript, shrinks its region from
			// 6 to 3 rows, then spends a long time on region-only spinner repaints —
			// the shape of a Claude Code session finishing work while the pane is
			// away, and exactly the byte pattern that used to strand a ghost copy of
			// the pre-gap 6-row box above the live one. The attach-time grid resync
			// must converge the renderer regardless.
			const preGapBoxFrame = totalFrames;
			await renderer.disconnect();
			await sleep(300);
			sendCommand(terminalId, "frames 200");
			totalFrames += 200;
			sendCommand(terminalId, "setH 3");
			sendCommand(terminalId, "ticks 1500"); // ≈105 KB of pure region repaints
			totalFrames += 1500;
			await waitForTrackerFrame(terminalId, totalFrames, 60_000);
			await renderer.connect(terminalId);
			await renderer.waitForFrame(totalFrames, 15_000);
			await sleep(200);
			await renderer.drain();

			const rendererGrid = visibleText(renderer.term);
			const truthGrid = await trackerVisible(terminalId);
			evidence.phase3 = { renderer: rendererGrid, truth: truthGrid };
			if (rendererGrid !== truthGrid) {
				console.log(
					"\nPHASE 3 reattach after huge gap — app truth (-) vs renderer grid (+):",
				);
				console.log(gridDiff(truthGrid, rendererGrid));
			}
			assert.equal(
				rendererGrid,
				truthGrid,
				"reattach after an output gap must resync the grid — artifacts mean the resync failed",
			);
			// No stranded copy of the pre-gap box (the old failure signature).
			const staleMarker = `INPUT ${String(preGapBoxFrame).padStart(6, "0")}`;
			assert.ok(
				!rendererGrid.includes(staleMarker),
				`ghost of the pre-gap box ("${staleMarker}") must not survive the resync`,
			);
			progress("PHASE 3 done");
			console.log(
				"PHASE 3 reattach after >100KB gap: grid resynced, no ghost, no resize needed ✓",
			);

			// ── Phase 4: same-dimensions resize stays clean (nothing to heal) ────────
			renderer.sendResize(COLS, ROWS);
			await sleep(500);
			await renderer.drain();
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"grid must stay in sync across a same-dims resize",
			);
			evidence.phase4 = { renderer: visibleText(renderer.term) };
			progress("PHASE 4 done");
			console.log("PHASE 4 same-dims resize: grids still identical ✓");

			// ── Phase 5: a REAL resize forces SIGWINCH → full repaint → healed ───────
			renderer.term.resize(COLS + 1, ROWS);
			renderer.sendResize(COLS + 1, ROWS);
			await waitFor(
				async () => {
					await renderer.drain();
					return visibleText(renderer.term).includes("FULL-REDRAW");
				},
				10_000,
				"SIGWINCH full repaint to arrive",
			);
			// Let the repaint finish flowing, then compare.
			await sleep(300);
			await renderer.drain();
			assert.equal(
				visibleText(renderer.term),
				await trackerVisible(terminalId),
				"grids must stay in sync across a real resize (SIGWINCH repaint)",
			);
			evidence.phase5 = {
				renderer: visibleText(renderer.term),
				truth: await trackerVisible(terminalId),
			};
			if (process.env.REPLAYGAP_EVIDENCE_PATH) {
				fs.writeFileSync(
					process.env.REPLAYGAP_EVIDENCE_PATH,
					JSON.stringify(evidence, null, 2),
				);
			}
			progress("PHASE 5 done");
			console.log(
				"PHASE 5 real resize (+1 col): SIGWINCH full repaint, grids identical ✓",
			);
		} finally {
			// A live bash loop wedges daemon/server teardown in after() — always
			// dispose, even when a phase assertion throws.
			await renderer.disconnect().catch(() => {});
			renderer.term.dispose();
			await disposeSessionAndWait(terminalId, db).catch(() => {});
		}
	},
);
