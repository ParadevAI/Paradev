import {
	createLeakedInputModeReclaimer,
	LEAKED_MODE_DISARM,
	type LeakableInputMode,
	SHELL_READY_MARKER_PAYLOAD,
	SHELL_READY_OSC_ID,
} from "@superset/shared/leaked-input-mode-reclaim";
import type { IDisposable, Terminal } from "@xterm/xterm";

/**
 * Renderer adapter that wires xterm's parser to the shared leaked-input-mode
 * reclaimer (#4949).
 *
 * v2 workspace terminals stream PTY output straight to this xterm and never route
 * through the terminal-host daemon's HeadlessEmulator, so the host-side foreground
 * reclaim never runs for them. A TUI (mastracode/pi-tui, Claude Code) that arms
 * the kitty keyboard protocol / mouse / focus reporting and is killed while
 * attached leaves every keystroke CSI-u encoded — Ctrl+C dead, shell unusable
 * until `reset`. #5519's renderer disarm only fires on cold restore / terminal
 * restart, not a live kill.
 *
 * This observes mode arming and the OSC 777 shell-ready marker via xterm parser
 * handlers (chunk-safe, exact) and feeds them to the shared reclaimer, which
 * decides what to disarm. The marker queues the candidate disarm bytes between two
 * sentinel OSCs, and the decision is made when xterm parses the opening sentinel:
 * a TUI that re-armed in between (fg after ^Z, or a new TUI racing the prompt)
 * has its disarm swallowed, so it keeps its modes. The decision logic lives in
 * the shared module so a host-side surface can reuse it later.
 */
const RECLAIM_BEGIN_PAYLOAD = "superset-reclaim-begin";
const RECLAIM_END_PAYLOAD = "superset-reclaim-end";
const osc = (payload: string) => `\x1b]${SHELL_READY_OSC_ID};${payload}\x07`;

function decMode(param: number | number[]): LeakableInputMode | undefined {
	const primary = typeof param === "number" ? param : param[0];
	if (primary === 1000 || primary === 1002 || primary === 1003) return "mouse";
	if (primary === 1004) return "focus";
	return undefined;
}

export function installInputModeReclaimer(terminal: Terminal): IDisposable {
	const reclaimer = createLeakedInputModeReclaimer();
	const parser = terminal.parser;
	const disposables: IDisposable[] = [];
	// Set while xterm parses our own disarm burst: modes re-armed since the marker.
	let keep: Set<LeakableInputMode> | null = null;

	// Kitty keyboard protocol: `CSI > flags u` push/arm, `CSI = flags ; mode u`
	// set (0 disarms), `CSI < n u` pop/disarm. Return false so xterm still applies.
	disposables.push(
		parser.registerCsiHandler({ prefix: ">", final: "u" }, () => {
			reclaimer.noteArm("kitty", true);
			return false;
		}),
	);
	disposables.push(
		parser.registerCsiHandler({ prefix: "=", final: "u" }, (params) => {
			const raw = params[0];
			const flags = typeof raw === "number" ? raw : (raw?.[0] ?? 0);
			if (flags === 0 && keep?.has("kitty")) return true;
			reclaimer.noteArm("kitty", flags !== 0);
			return false;
		}),
	);
	disposables.push(
		parser.registerCsiHandler({ prefix: "<", final: "u" }, () => {
			if (keep?.has("kitty")) return true;
			reclaimer.noteArm("kitty", false);
			return false;
		}),
	);

	// Mouse tracking (?1000/1002/1003) and focus reporting (?1004).
	const applyDecMode = (
		params: (number | number[])[],
		armed: boolean,
	): void => {
		for (const param of params) {
			const mode = decMode(param);
			if (mode) reclaimer.noteArm(mode, armed);
		}
	};
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "h" }, (params) => {
			applyDecMode(params, true);
			return false;
		}),
	);
	disposables.push(
		parser.registerCsiHandler({ prefix: "?", final: "l" }, (params) => {
			const kept = keep;
			const modes = params.map(decMode);
			if (kept && modes.some((mode) => mode && kept.has(mode))) return true;
			applyDecMode(params, false);
			return false;
		}),
	);

	disposables.push(
		parser.registerOscHandler(SHELL_READY_OSC_ID, (data) => {
			if (data === RECLAIM_BEGIN_PAYLOAD) {
				const disarm = reclaimer.collectDisarm();
				keep = new Set(
					(Object.keys(LEAKED_MODE_DISARM) as LeakableInputMode[]).filter(
						(mode) => !disarm.includes(LEAKED_MODE_DISARM[mode]),
					),
				);
				return true;
			}
			if (data === RECLAIM_END_PAYLOAD) {
				keep = null;
				return true;
			}
			// Exact match: OSC 777 is also urxvt's notification channel.
			if (data !== SHELL_READY_MARKER_PAYLOAD) return false;
			reclaimer.noteShellReady();
			const candidates = reclaimer
				.snapshot()
				.modes.filter(([, s]) => s.pending)
				.map(([mode]) => LEAKED_MODE_DISARM[mode])
				.join("");
			if (candidates) {
				terminal.write(
					osc(RECLAIM_BEGIN_PAYLOAD) + candidates + osc(RECLAIM_END_PAYLOAD),
				);
			}
			return false;
		}),
	);

	return {
		dispose(): void {
			for (const d of disposables) d.dispose();
		},
	};
}
