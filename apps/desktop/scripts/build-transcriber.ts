import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

const TARGET_PLATFORM = process.env.TARGET_PLATFORM ?? process.platform;
const TARGET_ARCH = process.env.TARGET_ARCH ?? process.arch;
const MINIMUM_MACOS = "12.0";
const SWIFT_ARCHS: Record<string, string> = { arm64: "arm64", x64: "x86_64" };

const desktopDir = resolve(import.meta.dirname, "..");
const source = resolve(desktopDir, "native/transcriber/main.swift");
// Embedded so TCC finds a usage description when the helper asks itself.
const infoPlist = resolve(desktopDir, "native/transcriber/Info.plist");
const outfile = resolve(desktopDir, "dist/resources/bin/superset-transcriber");

function main() {
	if (TARGET_PLATFORM !== "darwin") {
		console.log("[transcriber] skipped: macOS only");
		return;
	}
	const arch = SWIFT_ARCHS[TARGET_ARCH];
	if (!arch) throw new Error(`[transcriber] unsupported arch ${TARGET_ARCH}`);
	if (isUpToDate()) {
		console.log("[transcriber] up to date");
		return;
	}
	mkdirSync(dirname(outfile), { recursive: true });
	const result = spawnSync(
		"xcrun",
		[
			"swiftc",
			"-O",
			"-target",
			`${arch}-apple-macos${MINIMUM_MACOS}`,
			source,
			"-Xlinker",
			"-sectcreate",
			"-Xlinker",
			"__TEXT",
			"-Xlinker",
			"__info_plist",
			"-Xlinker",
			infoPlist,
			"-o",
			outfile,
		],
		{ stdio: "inherit" },
	);
	if (result.status === 0) {
		console.log(`[transcriber] built ${outfile}`);
		return;
	}
	const reason = result.error?.message ?? `swiftc exited with ${result.status}`;
	// Without the helper, dictation falls back to the API's transcription.
	if (process.env.CI) throw new Error(`[transcriber] ${reason}`);
	console.warn(`[transcriber] skipped: ${reason}`);
}

// A release build sets TARGET_ARCH, and the output may be for another arch.
function isUpToDate(): boolean {
	if (process.env.CI || process.env.TARGET_ARCH || !existsSync(outfile))
		return false;
	const built = statSync(outfile).mtimeMs;
	return [source, infoPlist, import.meta.filename].every(
		(input) => statSync(input).mtimeMs < built,
	);
}

main();
