import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	parsePressure,
	readBoxResources,
	readMemguardActions,
} from "./box-resources";

const NOW = 1_763_000_000_000;
const REAP_TAIL = "adj=500 available=500MB drop=200MB floor=650MB";

function reapLine(at: number, name: string): string {
	return `${at} memguard reap pid=9 ${name} rss=3100MB ${REAP_TAIL}`;
}

function lastReapName(path: string, notBefore = 0): string | undefined {
	const reaps = readMemguardActions(path, notBefore).filter(
		(action) => action.kind === "reap",
	);
	return reaps.at(-1)?.processName;
}
const roots: string[] = [];

afterAll(() => {
	for (const root of roots) rmSync(root, { recursive: true, force: true });
});

function logFile(contents: string): string {
	const root = mkdtempSync(join(tmpdir(), "box-resources-"));
	roots.push(root);
	const path = join(root, "memguard.log");
	writeFileSync(path, contents);
	return path;
}

function pressure(someAvg60: number, fullAvg10 = 0, fullAvg60 = 0) {
	return [
		`some avg10=1.00 avg60=${someAvg60.toFixed(2)} avg300=1.00 total=1`,
		`full avg10=${fullAvg10.toFixed(2)} avg60=${fullAvg60.toFixed(2)} avg300=0.00 total=1`,
	].join("\n");
}

function box(files: {
	cpu: string;
	memory: string;
	memguardLog?: string;
	memoryMax?: string;
	memoryStat?: string;
}) {
	const root = mkdtempSync(join(tmpdir(), "box-resources-"));
	roots.push(root);
	writeFileSync(join(root, "memory.stat"), files.memoryStat ?? "");
	writeFileSync(join(root, "cpu.pressure"), files.cpu);
	writeFileSync(join(root, "memory.pressure"), files.memory);
	writeFileSync(join(root, "memory.current"), String(6 * 1024 ** 3));
	writeFileSync(
		join(root, "memory.max"),
		files.memoryMax ?? String(8 * 1024 ** 3),
	);
	const memguardLog = join(root, "memguard.log");
	writeFileSync(memguardLog, files.memguardLog ?? "");
	return { cgroupRoot: root, memguardLog, now: NOW, vcpus: 4 };
}

describe("readBoxResources", () => {
	test("a quiet box is ok and reports its size", () => {
		const resources = readBoxResources(
			box({ cpu: pressure(3), memory: pressure(0) }),
		);
		expect(resources).toMatchObject({
			vcpus: 4,
			memoryUsedMb: 6144,
			memoryLimitMb: 8192,
			memguardActions: [],
		});
	});

	test("reclaimable page cache does not count as used memory", () => {
		const resources = readBoxResources(
			box({
				cpu: pressure(3),
				memory: pressure(0),
				memoryStat: `anon 1\ninactive_file ${1024 ** 3}\nactive_file 1`,
			}),
		);
		expect(resources?.memoryUsedMb).toBe(5120);
	});

	test("reports the minute's CPU waiting and the ten-second memory stall", () => {
		expect(
			readBoxResources(box({ cpu: pressure(46), memory: pressure(0, 12, 3) })),
		).toMatchObject({
			cpuWaitingPercent: 46,
			memoryStalledPercent: 3,
			memoryStalledNowPercent: 12,
		});
	});

	test("reads memguard's kills and unrelieved pressure oldest first, without rank lines", () => {
		const log = [
			`${NOW - 60_000} memguard rank pid=7 node 0->500`,
			reapLine(NOW - 30_000, "tsc"),
			`${NOW - 20_000} memguard pressure available=600MB floor=650MB nothing to reap`,
		].join("\n");
		const resources = readBoxResources(
			box({ cpu: pressure(3), memory: pressure(0), memguardLog: log }),
		);
		expect(resources?.memguardActions).toEqual([
			{
				kind: "reap",
				at: NOW - 30_000,
				processName: "tsc",
				rssMb: 3100,
				adj: 500,
				availableMb: 500,
				floorMb: 650,
			},
			{ kind: "pressure", at: NOW - 20_000, availableMb: 600, floorMb: 650 },
		]);
	});

	test("an action older than ten minutes no longer counts", () => {
		const log = reapLine(NOW - 11 * 60_000, "tsc");
		expect(
			readBoxResources(
				box({ cpu: pressure(3), memory: pressure(0), memguardLog: log }),
			)?.memguardActions,
		).toEqual([]);
	});

	test("a host without cgroup files or a memory limit reports nothing", () => {
		expect(
			readBoxResources({
				cgroupRoot: join(tmpdir(), "no-such-cgroup"),
				memguardLog: "",
			}),
		).toBeNull();
		expect(
			readBoxResources(
				box({ cpu: pressure(3), memory: pressure(0), memoryMax: "max" }),
			),
		).toBeNull();
	});
});

test("parsePressure reads the some and full lines", () => {
	expect(parsePressure(pressure(21.4, 0.2, 0.3))).toEqual({
		some: { avg10: 1, avg60: 21.4 },
		full: { avg10: 0.2, avg60: 0.3 },
	});
});

test("readMemguardActions reads a process name with spaces", () => {
	expect(lastReapName(logFile(reapLine(1, "Web Content")))).toBe("Web Content");
});

test("readMemguardActions ignores a reap from before memguard last started", () => {
	const log = [
		reapLine(1, "tsc"),
		"2 memguard start floor=8% user=ubuntu(1000)",
	].join("\n");
	expect(readMemguardActions(logFile(log), 0)).toEqual([]);
});

test("readMemguardActions ignores a reap from an earlier session of the box", () => {
	expect(readMemguardActions(logFile(reapLine(1, "tsc")), 2)).toEqual([]);
});

test("readMemguardActions finds a kill buried under more than one chunk of rank lines", () => {
	const rank = `${NOW} memguard rank pid=7 node 0->500\n`.repeat(4000);
	const path = logFile(`${reapLine(NOW - 1, "tsc")}\n${rank}`);
	expect(lastReapName(path)).toBe("tsc");
});

test("readMemguardActions reads a kill line split across a chunk boundary", () => {
	const chunk = 64 * 1024;
	const reap = `${reapLine(NOW - 1, "tsc")}\n`;
	// One unstamped line of chunk-10 bytes puts the last chunk's start ten
	// bytes before the end of the reap line.
	const after = `${"y".repeat(chunk - 11)}\n`;
	const contents = reap + after;
	const boundary = contents.length - chunk;
	expect(boundary > 0 && boundary < reap.length).toBe(true);
	expect(lastReapName(logFile(contents))).toBe("tsc");
});
