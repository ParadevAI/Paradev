import {
	closeSync,
	fstatSync,
	openSync,
	readFileSync,
	readSync,
} from "node:fs";
import { availableParallelism, uptime } from "node:os";
import { join } from "node:path";
import { SANDBOX_PATHS } from "@superset/shared/sandbox/contract";
import {
	type MemguardAction,
	parseMemguardAction,
} from "@superset/shared/sandbox/memguard-log";

export interface BoxResources {
	vcpus: number;
	cpuWaitingPercent: number;
	memoryStalledPercent: number;
	memoryStalledNowPercent: number;
	memoryUsedMb: number;
	memoryLimitMb: number;
	/** What memguard did in the last ten minutes of this boot, oldest first. */
	memguardActions: MemguardAction[];
}

const MEMGUARD_RECENT_MS = 10 * 60_000;
const LOG_CHUNK_BYTES = 64 * 1024;
const LOG_SCAN_LIMIT_BYTES = 4 * 1024 * 1024;
const BYTES_PER_MB = 1024 * 1024;

interface PressureLine {
	avg10: number;
	avg60: number;
}

export function parsePressure(
	text: string,
): { some: PressureLine; full: PressureLine | null } | null {
	const lines: Record<string, PressureLine> = {};
	for (const line of text.split("\n")) {
		const [kind, ...fields] = line.trim().split(/\s+/);
		if (kind !== "some" && kind !== "full") continue;
		const values = Object.fromEntries(
			fields.map((field) => {
				const [key, value] = field.split("=");
				return [key, Number(value)];
			}),
		);
		const avg10 = values.avg10;
		const avg60 = values.avg60;
		if (Number.isFinite(avg10) && Number.isFinite(avg60)) {
			lines[kind] = { avg10, avg60 };
		}
	}
	return lines.some ? { some: lines.some, full: lines.full ?? null } : null;
}

const START_LINE = /^\d+ memguard start /;
const STAMPED_LINE = /^(\d+) memguard /;

function classifyLine(
	line: string,
	notBefore: number,
): MemguardAction | "stop" | null {
	if (START_LINE.test(line)) return "stop";
	const stamp = STAMPED_LINE.exec(line);
	if (stamp && Number(stamp[1]) < notBefore) return "stop";
	return parseMemguardAction(line);
}

export function readMemguardActions(
	path: string,
	notBefore: number,
): MemguardAction[] {
	const actions: MemguardAction[] = [];
	let fd: number | null = null;
	try {
		fd = openSync(path, "r");
		let position = fstatSync(fd).size;
		const floor = Math.max(0, position - LOG_SCAN_LIMIT_BYTES);
		let carry = "";
		while (position > floor) {
			const length = Math.min(LOG_CHUNK_BYTES, position - floor);
			position -= length;
			const buffer = Buffer.alloc(length);
			readSync(fd, buffer, 0, length, position);
			const lines = (buffer.toString("utf8") + carry).split("\n");
			carry = position > floor ? (lines.shift() ?? "") : "";
			for (let index = lines.length - 1; index >= 0; index--) {
				const result = classifyLine(lines[index] ?? "", notBefore);
				if (result === "stop") return actions.reverse();
				if (result) actions.push(result);
			}
		}
		return actions.reverse();
	} catch {
		return [];
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

/** When this boot of the box began; a resumed session is a fresh VM. */
export function boxBootedAt(now = Date.now()): number {
	return now - uptime() * 1000;
}

export function readSandboxBoxResources(): BoxResources | null {
	return readBoxResources({
		cgroupRoot: "/sys/fs/cgroup",
		memguardLog: join(SANDBOX_PATHS.logs, "memguard.log"),
		notBefore: boxBootedAt(),
	});
}

function readOptional(path: string): string | null {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return null;
	}
}

function readInactiveFileBytes(cgroupRoot: string): number {
	const stat = readOptional(join(cgroupRoot, "memory.stat")) ?? "";
	const match = /^inactive_file (\d+)$/m.exec(stat);
	return match ? Number(match[1]) : 0;
}

function readMemoryLimitMb(cgroupRoot: string): number | null {
	const max = readOptional(join(cgroupRoot, "memory.max"))?.trim();
	if (!max || max === "max") return null;
	const bytes = Number(max);
	return Number.isFinite(bytes) ? Math.round(bytes / BYTES_PER_MB) : null;
}

/** The box has no CPU quota, so `cpu.stat` never counts throttling: CPU pressure is the signal. */
export function readBoxResources(options: {
	cgroupRoot: string;
	memguardLog: string;
	notBefore?: number;
	now?: number;
	vcpus?: number;
}): BoxResources | null {
	const cpu = parsePressure(
		readOptional(join(options.cgroupRoot, "cpu.pressure")) ?? "",
	);
	const memory = parsePressure(
		readOptional(join(options.cgroupRoot, "memory.pressure")) ?? "",
	);
	const memoryCurrent = Number(
		readOptional(join(options.cgroupRoot, "memory.current"))?.trim(),
	);
	const memoryLimitMb = readMemoryLimitMb(options.cgroupRoot);
	if (!cpu || !memory || !memoryLimitMb || !Number.isFinite(memoryCurrent)) {
		return null;
	}

	const now = options.now ?? Date.now();
	const memguardActions = readMemguardActions(
		options.memguardLog,
		Math.max(options.notBefore ?? 0, now - MEMGUARD_RECENT_MS),
	);

	return {
		vcpus: options.vcpus ?? availableParallelism(),
		cpuWaitingPercent: cpu.some.avg60,
		memoryStalledPercent: memory.full?.avg60 ?? 0,
		memoryStalledNowPercent: memory.full?.avg10 ?? 0,
		memoryUsedMb: Math.round(
			Math.max(0, memoryCurrent - readInactiveFileBytes(options.cgroupRoot)) /
				BYTES_PER_MB,
		),
		memoryLimitMb,
		memguardActions,
	};
}
