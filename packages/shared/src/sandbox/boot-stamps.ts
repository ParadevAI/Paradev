/**
 * One phase of a sandbox boot: `at` is the epoch in milliseconds, written by
 * the boot script (`stamp <phase>`) or by host-service once it listens.
 */
export interface BootStamp {
	phase: string;
	at: number;
}

/** The first segment of every phase `superset-boot` and host-service stamp; a test holds the script to it. */
export const BOOT_PHASE_FAMILIES = [
	"agents",
	"assets",
	"boot",
	"bundle",
	"checkout",
	"desktop",
	"hook",
	"host",
	"hostdb",
	"memguard",
	"resources",
	"rootfs",
	"run",
	"steps",
	"workspace",
] as const;

export type BootPhase = `${(typeof BOOT_PHASE_FAMILIES)[number]}.${string}`;

const BOOT_START = "boot.start";
/** `<epoch ms> <phase> [detail]`; the runner's own lines (`setup …`) carry no phase and are skipped below. */
const STAMP_LINE = /^(\d{13}) ([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?: .*)?$/;

/**
 * The boot log is append-only across wakes, so a boot is the run of lines
 * from the last `boot.start`. A phase is a dotted token; a line's trailing
 * detail and lines the runner's subcommands print are skipped.
 */
export function parseBootStamps(log: string): BootStamp[] {
	let current: BootStamp[] = [];
	for (const line of log.split("\n")) {
		const match = STAMP_LINE.exec(line.trim());
		if (!match?.[1] || !match[2]) continue;
		const stamp = { at: Number(match[1]), phase: match[2] };
		if (stamp.phase === BOOT_START) current = [];
		current.push(stamp);
	}
	return current;
}
