import {
	closeSync,
	existsSync,
	lstatSync,
	mkdirSync,
	openSync,
	readSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { getBinDir } from "@superset/agent-setup/paths";
import { app } from "electron";

export const BUNDLED_CLI_SHIM_MARKER = "# Superset bundled CLI shim v1";
const SHIM_HEADER_BYTES = 2048;

export type BundledCliInstallStatus = "installed" | "missing" | "skipped";

interface InstallBundledCliShimOptions {
	binDir?: string;
	bundledCliPath?: string | null;
	platform?: NodeJS.Platform;
}

interface InstallBundledPdevShimOptions {
	binDir?: string;
	bundledPdevPath?: string | null;
	platform?: NodeJS.Platform;
}

type ShimEnv = Array<[string, string]>;

export function getBundledCliBinaryName(
	platform: NodeJS.Platform = process.platform,
): string {
	return platform === "win32" ? "superset.exe" : "superset";
}

export function getBundledCliShimName(
	platform: NodeJS.Platform = process.platform,
): string {
	return shimName("superset", platform);
}

function shimName(command: string, platform: NodeJS.Platform): string {
	return platform === "win32" ? `${command}.cmd` : command;
}

function quoteShellLiteral(value: string): string {
	return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function quoteCmdLiteral(value: string): string {
	return `"${value.replaceAll('"', '""')}"`;
}

/**
 * A dev build talks to a dev stack, and the binary defaults to production, so
 * the addresses travel in the shim rather than being compiled into the CLI.
 */
function devStackAddresses(): ShimEnv {
	if (app.isPackaged) return [];
	const api = process.env.NEXT_PUBLIC_API_URL;
	const web = process.env.NEXT_PUBLIC_WEB_URL;
	const realtime = process.env.REALTIME_URL;
	return [
		...(api ? ([["SUPERSET_API_URL", api]] as Array<[string, string]>) : []),
		...(web ? ([["SUPERSET_WEB_URL", web]] as Array<[string, string]>) : []),
		...(realtime
			? ([["REALTIME_URL", realtime]] as Array<[string, string]>)
			: []),
	];
}

export function buildBundledCliShim(
	bundledCliPath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	return buildShim(bundledCliPath, platform, devStackAddresses());
}

export function buildBundledPdevShim(
	bundledPdevPath: string,
	platform: NodeJS.Platform = process.platform,
): string {
	return buildShim(bundledPdevPath, platform, []);
}

function buildShim(
	binaryPath: string,
	platform: NodeJS.Platform,
	env: ShimEnv,
): string {
	if (platform === "win32") {
		const sets = env.map(([key, value]) => `set ${key}=${value}\r\n`).join("");
		return `@echo off\r\nrem ${BUNDLED_CLI_SHIM_MARKER}\r\n${sets}${quoteCmdLiteral(
			binaryPath,
		)} %*\r\n`;
	}

	const exports = env
		.map(([key, value]) => `export ${key}=${quoteShellLiteral(value)}\n`)
		.join("");
	return `#!/bin/sh
${BUNDLED_CLI_SHIM_MARKER}
${exports}exec ${quoteShellLiteral(binaryPath)} "$@"
`;
}

function getBundledCliCandidates(platform: NodeJS.Platform): string[] {
	const binaryName = getBundledCliBinaryName(platform);
	const candidates = [
		app.isPackaged
			? path.join(process.resourcesPath, "resources/bin", binaryName)
			: null,
		path.join(__dirname, "../resources/bin", binaryName),
		path.join(app.getAppPath(), "dist/resources/bin", binaryName),
		path.resolve(app.getAppPath(), "../../packages/cli/dist", binaryName),
	];

	return candidates.filter((candidate): candidate is string => !!candidate);
}

export function resolveBundledCliPath(
	platform: NodeJS.Platform = process.platform,
): string | null {
	return (
		getBundledCliCandidates(platform).find((candidate) =>
			existsSync(candidate),
		) ?? null
	);
}

function getBundledPdevCandidates(): string[] {
	const relative = path.join("pdev", "pdev");
	const candidates = [
		app.isPackaged
			? path.join(process.resourcesPath, "resources/bin", relative)
			: null,
		path.join(__dirname, "../resources/bin", relative),
		path.join(app.getAppPath(), "dist/resources/bin", relative),
	];

	return candidates.filter((candidate): candidate is string => !!candidate);
}

export function resolveBundledPdevPath(
	platform: NodeJS.Platform = process.platform,
): string | null {
	if (platform === "win32") return null;
	return (
		getBundledPdevCandidates().find((candidate) => existsSync(candidate)) ??
		null
	);
}

function shouldReplaceShim(shimPath: string): boolean {
	if (!existsSync(shimPath)) return true;

	const stat = lstatSync(shimPath);
	if (!stat.isFile()) return false;

	const fd = openSync(shimPath, "r");
	try {
		const buffer = Buffer.alloc(Math.min(SHIM_HEADER_BYTES, stat.size));
		const bytesRead = readSync(fd, buffer, 0, buffer.length, 0);
		return buffer
			.toString("utf-8", 0, bytesRead)
			.includes(BUNDLED_CLI_SHIM_MARKER);
	} finally {
		closeSync(fd);
	}
}

export function installBundledCliShim(
	options: InstallBundledCliShimOptions = {},
): BundledCliInstallStatus {
	const platform = options.platform ?? process.platform;
	const bundledCliPath =
		options.bundledCliPath ?? resolveBundledCliPath(platform);
	if (!bundledCliPath || !existsSync(bundledCliPath)) {
		console.debug("[bundled-cli] No bundled CLI binary found");
		return "missing";
	}
	return installShim({
		shimPath: path.join(
			options.binDir ?? getBinDir(),
			shimName("superset", platform),
		),
		contents: buildBundledCliShim(bundledCliPath, platform),
		platform,
	});
}

export function installBundledPdevShim(
	options: InstallBundledPdevShimOptions = {},
): BundledCliInstallStatus {
	const platform = options.platform ?? process.platform;
	const shimPath = path.join(
		options.binDir ?? getBinDir(),
		shimName("pdev", platform),
	);
	const bundledPdevPath =
		options.bundledPdevPath ?? resolveBundledPdevPath(platform);
	if (!bundledPdevPath || !existsSync(bundledPdevPath)) {
		console.debug("[bundled-cli] No bundled pdev binary found");
		if (existsSync(shimPath) && shouldReplaceShim(shimPath)) {
			unlinkSync(shimPath);
		}
		return "missing";
	}
	return installShim({
		shimPath,
		contents: buildBundledPdevShim(bundledPdevPath, platform),
		platform,
	});
}

function installShim(options: {
	shimPath: string;
	contents: string;
	platform: NodeJS.Platform;
}): BundledCliInstallStatus {
	const { shimPath, contents, platform } = options;
	if (!shouldReplaceShim(shimPath)) {
		console.warn(
			`[bundled-cli] Skipping ${shimPath}; an unmanaged file already exists`,
		);
		return "skipped";
	}

	mkdirSync(path.dirname(shimPath), { recursive: true });
	if (existsSync(shimPath)) {
		unlinkSync(shimPath);
	}
	writeFileSync(shimPath, contents, {
		mode: platform === "win32" ? 0o644 : 0o755,
	});

	console.log(`[bundled-cli] Installed shim at ${shimPath}`);
	return "installed";
}
