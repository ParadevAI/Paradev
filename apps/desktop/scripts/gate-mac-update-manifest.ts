/**
 * Adds `minimumSystemVersion` to the macOS update manifests so electron-updater
 * on an older macOS skips a build that macOS will refuse to launch.
 *
 * Usage: bun scripts/gate-mac-update-manifest.ts <release-dir>
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// electron-updater compares this value with os.release(), which on macOS is
// the Darwin version: macOS 11-15 are Darwin 20-24, macOS 26 is Darwin 25.
export function darwinVersionFor(macosVersion: string): string {
	const major = Number.parseInt(macosVersion.split(".")[0] ?? "", 10);
	if (major >= 11 && major <= 15) return `${major + 9}.0.0`;
	if (major >= 26) return `${major - 1}.0.0`;
	throw new Error(`Unsupported LSMinimumSystemVersion: ${macosVersion}`);
}

export function withMinimumSystemVersion(
	manifest: string,
	darwinVersion: string,
): string {
	const lines = manifest
		.replace(/\n+$/, "")
		.split("\n")
		.filter((line) => !line.startsWith("minimumSystemVersion:"));
	lines.push(`minimumSystemVersion: '${darwinVersion}'`);
	return `${lines.join("\n")}\n`;
}

function findApp(releaseDir: string): string {
	for (const entry of readdirSync(releaseDir)) {
		const dir = join(releaseDir, entry);
		if (!statSync(dir).isDirectory()) continue;
		const app = readdirSync(dir).find((name) => name.endsWith(".app"));
		if (app) return join(dir, app);
	}
	throw new Error(`No .app bundle under ${releaseDir}`);
}

function main(releaseDir: string): void {
	const app = findApp(releaseDir);
	const macosVersion = execFileSync(
		"plutil",
		[
			"-extract",
			"LSMinimumSystemVersion",
			"raw",
			join(app, "Contents/Info.plist"),
		],
		{ encoding: "utf8" },
	).trim();
	const darwinVersion = darwinVersionFor(macosVersion);

	const manifests = readdirSync(releaseDir).filter((name) =>
		name.endsWith("-mac.yml"),
	);
	if (manifests.length === 0) {
		throw new Error(`No *-mac.yml manifest in ${releaseDir}`);
	}
	for (const name of manifests) {
		const path = join(releaseDir, name);
		writeFileSync(
			path,
			withMinimumSystemVersion(readFileSync(path, "utf8"), darwinVersion),
		);
		console.log(
			`${name}: minimumSystemVersion ${darwinVersion} (macOS ${macosVersion})`,
		);
	}
}

if (import.meta.main) {
	const releaseDir = process.argv[2];
	if (!releaseDir) {
		console.error(
			"Usage: bun scripts/gate-mac-update-manifest.ts <release-dir>",
		);
		process.exit(1);
	}
	main(releaseDir);
}
