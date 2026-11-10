import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	AgentInstallError,
	type AgentInstallEvent,
	downloadVerified,
	type Fetcher,
	fetchOk,
	parseIntegrity,
	toFailedEvent,
} from "../download-verified";

export const CODEX_REGISTRY_URL = "https://registry.npmjs.org/@openai/codex";
const TARBALL_ORIGIN = "https://registry.npmjs.org";

export interface InstallCodexOptions {
	fetch: Fetcher;
	/** Holds one unpacked release per version. */
	rootDir: string;
	/** The launcher the app and terminals run. */
	launcherPath: string;
	arch?: string;
	verifySignature: (binaryPath: string) => Promise<boolean>;
	extractTarball: (tarballPath: string, destDir: string) => Promise<void>;
	readVersion: (binaryPath: string) => Promise<string | null>;
	onProgress?: (event: AgentInstallEvent) => void;
	signal?: AbortSignal;
}

function codexTarget(arch: string): { npmSuffix: string; triple: string } {
	return arch === "arm64"
		? { npmSuffix: "darwin-arm64", triple: "aarch64-apple-darwin" }
		: { npmSuffix: "darwin-x64", triple: "x86_64-apple-darwin" };
}

export function codexLauncherScript(binaryPath: string): string {
	const quoted = `'${binaryPath.replaceAll("'", `'"'"'`)}'`;
	return `#!/bin/sh\nexec ${quoted} "$@"\n`;
}

async function readJson(
	fetcher: Fetcher,
	url: string,
	signal?: AbortSignal,
): Promise<Record<string, unknown>> {
	const body = await (await fetchOk(fetcher, url, signal))
		.json()
		.catch(() => null);
	if (!body || typeof body !== "object")
		throw new AgentInstallError("download");
	return body as Record<string, unknown>;
}

/**
 * Codex's macOS build from its npm platform package, fetched without npm:
 * the tarball is checked against the registry's sha512 integrity and the
 * binary against OpenAI's code signature before it is put in place.
 */
export async function installCodex(
	options: InstallCodexOptions,
): Promise<AgentInstallEvent> {
	const emit = (event: AgentInstallEvent) => options.onProgress?.(event);
	const { npmSuffix, triple } = codexTarget(options.arch ?? process.arch);
	const stagingDir = path.join(options.rootDir, `.staging-${randomUUID()}`);
	try {
		const latest = await readJson(
			options.fetch,
			`${CODEX_REGISTRY_URL}/latest`,
			options.signal,
		);
		const version = latest.version;
		if (typeof version !== "string" || !/^\d+\.\d+\.\d+/.test(version)) {
			throw new AgentInstallError("download");
		}
		const platformPackage = await readJson(
			options.fetch,
			`${CODEX_REGISTRY_URL}/${version}-${npmSuffix}`,
			options.signal,
		);
		const dist = platformPackage.dist as
			| { tarball?: unknown; integrity?: unknown }
			| undefined;
		const digest = parseIntegrity(dist?.integrity);
		const tarball = dist?.tarball;
		if (
			!digest ||
			typeof tarball !== "string" ||
			!tarball.startsWith(`${TARBALL_ORIGIN}/`)
		) {
			throw new AgentInstallError("checksum");
		}

		await fs.mkdir(stagingDir, { recursive: true });
		const tarballPath = path.join(stagingDir, "codex.tgz");
		await downloadVerified({
			fetch: options.fetch,
			url: tarball,
			destPath: tarballPath,
			digest,
			signal: options.signal,
			onProgress: (receivedBytes, totalBytes) =>
				emit({ stage: "downloading", receivedBytes, totalBytes }),
		});

		emit({ stage: "verifying" });
		const unpacked = path.join(stagingDir, "package");
		await fs.mkdir(unpacked);
		await options.extractTarball(tarballPath, unpacked).catch(() => {
			throw new AgentInstallError("install");
		});
		const relativeBinary = path.join("vendor", triple, "bin", "codex");
		if (!(await options.verifySignature(path.join(unpacked, relativeBinary)))) {
			throw new AgentInstallError("signature");
		}

		emit({ stage: "installing" });
		const releaseDir = path.join(options.rootDir, version);
		await fs.rm(releaseDir, { recursive: true, force: true });
		await fs.rename(unpacked, releaseDir);
		const binaryPath = path.join(releaseDir, relativeBinary);
		const stagedLauncher = `${options.launcherPath}.${randomUUID()}.tmp`;
		await fs.mkdir(path.dirname(options.launcherPath), { recursive: true });
		await fs.writeFile(stagedLauncher, codexLauncherScript(binaryPath), {
			mode: 0o755,
		});
		await fs.rename(stagedLauncher, options.launcherPath);

		const installedVersion = await options.readVersion(options.launcherPath);
		if (!installedVersion) throw new AgentInstallError("install");
		await removeOtherReleases(options.rootDir, version);
		const done: AgentInstallEvent = {
			stage: "done",
			version: installedVersion,
			path: options.launcherPath,
		};
		emit(done);
		return done;
	} catch (error) {
		const failed = toFailedEvent(error);
		emit(failed);
		return failed;
	} finally {
		await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => {});
	}
}

async function removeOtherReleases(
	rootDir: string,
	keep: string,
): Promise<void> {
	const entries = await fs.readdir(rootDir).catch(() => []);
	await Promise.all(
		entries
			.filter((entry) => entry !== keep && !entry.startsWith("."))
			.map((entry) =>
				fs
					.rm(path.join(rootDir, entry), { recursive: true, force: true })
					.catch(() => {}),
			),
	);
}
