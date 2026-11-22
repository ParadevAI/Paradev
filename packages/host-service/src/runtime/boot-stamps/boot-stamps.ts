import { appendFileSync, readFileSync } from "node:fs";
import {
	type BootStamp,
	parseBootStamps,
} from "@superset/shared/sandbox/boot-stamps";
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

export function readBootStamps(): BootStamp[] {
	const path = bootLogPath();
	if (!path) return [];
	try {
		return parseBootStamps(readFileSync(path, "utf8"));
	} catch {
		return [];
	}
}
