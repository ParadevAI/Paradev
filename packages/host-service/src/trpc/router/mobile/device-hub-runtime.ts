import { execFile } from "node:child_process";
import { cp, open, readdir, rm, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const CLI = join("dist", "server", "cli.mjs");
const SIMULATOR_HELPERS_DIR = join("vendor", "serve-sim", "dist");
const SIMULATOR_HELPER_SUBDIRS = [
	"capability-loader",
	"simax",
	"simpb",
	"simcam",
];
const MACH_O_MAGICS = new Set([0xfeedfacf, 0xcffaedfe, 0xcafebabe, 0xbebafeca]);

let prepared: Promise<string> | null = null;

/**
 * The hub's entry point. The packaged app ships the hub unpacked, since its
 * helpers and native addon cannot run from inside app.asar.
 *
 * On macOS the packaged copy cannot be used as is: signing the app gives
 * serve-sim's iOS-simulator helpers its Developer ID signature, and the
 * simulator's processes refuse to load them. The hub runs from a copy in
 * `workDir` whose helpers are signed ad hoc again.
 */
export function deviceHubCli(workDir: string): Promise<string> {
	const packageDir = dirname(
		createRequire(import.meta.url).resolve("expo-device-hub/package.json"),
	);
	prepared ??= runnableDeviceHubCli(packageDir, workDir).catch((error) => {
		prepared = null;
		throw error;
	});
	return prepared;
}

export async function runnableDeviceHubCli(
	packageDir: string,
	workDir: string,
): Promise<string> {
	const unpackedDir = packageDir.replace(
		`app.asar${sep}`,
		`app.asar.unpacked${sep}`,
	);
	if (unpackedDir === packageDir || process.platform !== "darwin") {
		return join(unpackedDir, CLI);
	}

	const copyDir = join(workDir, "expo-device-hub");
	const nodeModulesLink = join(workDir, "node_modules");
	await rm(copyDir, { recursive: true, force: true });
	await rm(nodeModulesLink, { force: true });
	await cp(unpackedDir, copyDir, { recursive: true, verbatimSymlinks: true });
	await symlink(dirname(unpackedDir), nodeModulesLink, "dir");
	await signSimulatorHelpersAdHoc(join(copyDir, SIMULATOR_HELPERS_DIR));
	return join(copyDir, CLI);
}

async function signSimulatorHelpersAdHoc(helpersDir: string): Promise<void> {
	for (const subdir of SIMULATOR_HELPER_SUBDIRS) {
		const dir = join(helpersDir, subdir);
		const entries = await readdir(dir, { withFileTypes: true }).catch(
			(error: NodeJS.ErrnoException) => {
				if (error.code === "ENOENT") return [];
				throw error;
			},
		);
		for (const entry of entries) {
			const path = join(dir, entry.name);
			const isBundle = entry.isDirectory() && entry.name.endsWith(".app");
			if (!isBundle && !(entry.isFile() && (await isMachO(path)))) continue;
			await run("codesign", ["--force", "--deep", "--sign", "-", path]);
		}
	}
}

async function isMachO(path: string): Promise<boolean> {
	const file = await open(path, "r");
	try {
		const { buffer, bytesRead } = await file.read(Buffer.alloc(4), 0, 4, 0);
		return bytesRead === 4 && MACH_O_MAGICS.has(buffer.readUInt32BE(0));
	} finally {
		await file.close();
	}
}
