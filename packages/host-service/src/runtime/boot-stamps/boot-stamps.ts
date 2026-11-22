import { appendFileSync, readFileSync, statSync } from "node:fs";
import {
	type BootStamp,
	parseBootStamps,
} from "@superset/shared/sandbox/boot-stamps";
import { caught } from "../box-log-filter";
import { logBoxEvent } from "../../sentry";

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
export function recordBootStamp(phase: string, at = Date.now()): void {
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

/** Each call logs the current boot's stamps not logged yet; the log is parsed again only when it grows. */
export function bootPhaseLogger(path: string): () => void {
	let size = -1;
	let logged: BootStamp[] = [];
	return () => {
		const current = statSync(path, { throwIfNoEntry: false })?.size ?? 0;
		if (current === size) return;
		size = current;
		const stamps = readStamps(path);
		const start = stamps[0];
		if (!start) return;
		const sameBoot = logged[0]?.at === start.at;
		for (const stamp of sameBoot ? stamps.slice(logged.length) : stamps) {
			logBoxEvent("boot.phase", {
				"log.source": "boot",
				"boot.phase": stamp.phase,
				"boot.at": stamp.at,
				"boot.ms": stamp.at - start.at,
			});
		}
		logged = stamps;
	};
}
