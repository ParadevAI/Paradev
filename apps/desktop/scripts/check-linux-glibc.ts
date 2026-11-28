// Fails when a packaged Linux binary needs a glibc or libstdc++ newer than the supported distros ship.

import { spawnSync } from "node:child_process";
import { closeSync, openSync, readdirSync, readSync } from "node:fs";
import { join, relative } from "node:path";
import { LINUX_LIBC_FLOOR } from "./linux-libc-floor";

type Library = keyof typeof LINUX_LIBC_FLOOR;

export type VersionNeed = { library: Library; version: string };

export type Violation = VersionNeed & { file: string };

const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
const NEEDED_VERSION = /Name: (GLIBC|GLIBCXX)_(\d+(?:\.\d+)*)/;

export function compareVersions(a: string, b: string): number {
	const left = a.split(".").map(Number);
	const right = b.split(".").map(Number);
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const diff = (left[i] ?? 0) - (right[i] ?? 0);
		if (diff !== 0) return diff;
	}
	return 0;
}

/** Reads the "Version needs" section of `readelf -V -W`; a library's own version definitions are not needs. */
export function parseVersionNeeds(readelfOutput: string): VersionNeed[] {
	const needsSection = readelfOutput.split(/^Version needs section/m)[1];
	if (!needsSection) return [];
	const needs: VersionNeed[] = [];
	for (const line of needsSection.split("\n")) {
		const match = NEEDED_VERSION.exec(line);
		if (match) needs.push({ library: match[1] as Library, version: match[2] });
	}
	return needs;
}

export function highestNeeds(
	needs: VersionNeed[],
): Partial<Record<Library, string>> {
	const highest: Partial<Record<Library, string>> = {};
	for (const { library, version } of needs) {
		const current = highest[library];
		if (!current || compareVersions(version, current) > 0) {
			highest[library] = version;
		}
	}
	return highest;
}

export function findViolations(
	file: string,
	needs: VersionNeed[],
): Violation[] {
	return Object.entries(highestNeeds(needs))
		.filter(
			([library, version]) =>
				compareVersions(version, LINUX_LIBC_FLOOR[library as Library]) > 0,
		)
		.map(([library, version]) => ({
			file,
			library: library as Library,
			version,
		}));
}

function isElf(path: string): boolean {
	const header = Buffer.alloc(4);
	const fd = openSync(path, "r");
	try {
		return readSync(fd, header, 0, 4, 0) === 4 && header.equals(ELF_MAGIC);
	} finally {
		closeSync(fd);
	}
}

function* walkFiles(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walkFiles(path);
		else if (entry.isFile()) yield path;
	}
}

function readVersionNeeds(path: string): VersionNeed[] {
	const result = spawnSync("readelf", ["-V", "-W", path], {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	return parseVersionNeeds(result.stdout);
}

function main() {
	const root = process.argv[2];
	if (!root) {
		console.error("usage: bun run scripts/check-linux-glibc.ts <unpacked-dir>");
		process.exit(2);
	}
	const floor = `GLIBC ${LINUX_LIBC_FLOOR.GLIBC}, GLIBCXX ${LINUX_LIBC_FLOOR.GLIBCXX}`;
	const violations: Violation[] = [];
	let scanned = 0;
	for (const path of walkFiles(root)) {
		if (!isElf(path)) continue;
		scanned++;
		const file = relative(root, path);
		const needs = readVersionNeeds(path);
		const highest = highestNeeds(needs);
		console.log(`${highest.GLIBC ?? "-"}\t${highest.GLIBCXX ?? "-"}\t${file}`);
		violations.push(...findViolations(file, needs));
	}
	if (scanned === 0) {
		console.error(`[check-linux-glibc] no ELF files under ${root}`);
		process.exit(1);
	}
	for (const { file, library, version } of violations) {
		console.error(
			`::error::${file} needs ${library}_${version}, newer than the supported floor (${floor})`,
		);
	}
	if (violations.length > 0) process.exit(1);
	console.log(`[check-linux-glibc] OK: ${scanned} ELF files within ${floor}`);
}

if (import.meta.main) main();
