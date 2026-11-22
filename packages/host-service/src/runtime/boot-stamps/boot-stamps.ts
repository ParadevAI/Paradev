import { appendFileSync, readFileSync, statSync } from "node:fs";
import {
	BOOT_PHASE_FAMILIES,
	type BootPhase,
	type BootStamp,
	parseBootStamps,
} from "@superset/shared/sandbox/boot-stamps";
import { logBoxEvent } from "../../sentry";
import { caught } from "../box-log-filter";

export interface SandboxBootReport {
	/** The current boot's stamps in order, starting at its `boot.start`. */
	stamps: BootStamp[];
	runtime: {
		node: string;
		hostService: string;
	};
	/** The bundle the box is on (`current.bundle-hash`), null before the first boot. */
	bundle: string | null;
	/** Which of the boot runner's ready flags are up right now. */
	ready: Record<string, boolean>;
}

function bootLogPath(): string | undefined {
	return process.env.SUPERSET_SANDBOX_BOOT_LOG;
}

/** Appends a phase to the boot log; a host without one (every non-sandbox host) records nothing. */
export function recordBootStamp(phase: BootPhase, at = Date.now()): void {
	const path = bootLogPath();
	if (!path) return;
	try {
		appendFileSync(path, `${at} ${phase}\n`);
	} catch (error) {
		console.warn(
			"[boot-stamps] could not write (phase):",
			phase,
			caught(error),
		);
	}
}

/** The epoch this process started at, the way the boot script would have stamped it. */
export function processStartedAt(): number {
	return Date.now() - Math.round(process.uptime() * 1000);
}

function readStamps(path: string): BootStamp[] {
	try {
		return parseBootStamps(readFileSync(path, "utf8"));
	} catch {
		return [];
	}
}

export function readBootStamps(): BootStamp[] {
	const path = bootLogPath();
	return path ? readStamps(path) : [];
}

const BOOT_PHASE_CHECK_MS = 5_000;
const BOOT_PHASE_MAX_LENGTH = 40;

/** boot.log also holds raw step output, so a line that only looks like a stamp must not leave. */
function isOwnPhase(phase: string): boolean {
	const family = phase.slice(0, phase.indexOf("."));
	return (
		phase.length <= BOOT_PHASE_MAX_LENGTH &&
		(BOOT_PHASE_FAMILIES as readonly string[]).includes(family)
	);
}

/** Logs each stamp of the current boot once; the log is parsed again only when it grows. */
export function startSandboxBootPhaseLog(args: {
	path: string;
	every?: (tick: () => void, ms: number) => () => void;
}): () => void {
	let size = -1;
	const logged = new Set<string>();
	const tick = () => {
		const current = statSync(args.path, { throwIfNoEntry: false })?.size ?? 0;
		if (current === size) return;
		size = current;
		const stamps = readStamps(args.path).filter((stamp) =>
			isOwnPhase(stamp.phase),
		);
		const start = stamps[0];
		if (!start) return;
		for (const stamp of stamps) {
			const key = `${stamp.at} ${stamp.phase}`;
			if (logged.has(key)) continue;
			logged.add(key);
			logBoxEvent("boot.phase", {
				"log.source": "boot",
				"boot.phase": stamp.phase,
				"boot.at": stamp.at,
				"boot.ms": stamp.at - start.at,
			});
		}
	};
	const every =
		args.every ??
		((run: () => void, ms: number) => {
			const timer = setInterval(run, ms);
			timer.unref?.();
			return () => clearInterval(timer);
		});
	return every(tick, BOOT_PHASE_CHECK_MS);
}
