import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { isSignedByTeam, TEAM_IDS } from "../../../utils/code-signature";
import {
	downloadVerified,
	type Fetcher,
	fetchOk,
	InstallError,
	type InstallFailure,
	installFailureOf,
} from "../../../utils/download-verified";

const execFileAsync = promisify(execFile);

const LATEST_RELEASE_API_URL =
	"https://api.github.com/repos/cli/cli/releases/latest";
// Redirects to /releases/tag/v<version>, and is not under the API rate limit.
const LATEST_RELEASE_PAGE_URL = "https://github.com/cli/cli/releases/latest";
const GITHUB_API_HEADERS = { Accept: "application/vnd.github+json" };

export type GhInstallFailure = InstallFailure;

export type GhInstallEvent =
	| { stage: "downloading"; receivedBytes: number; totalBytes: number | null }
	| { stage: "verifying" }
	/** `untimed`: the step prints no progress (brew), so no stall timer applies. */
	| { stage: "installing"; untimed?: boolean }
	| { stage: "done"; version: string }
	| {
			stage: "failed";
			reason: GhInstallFailure;
			/** The macOS zip for a manual download, when the version is known. */
			downloadUrl: string | null;
	  };

export interface InstallGhCliOptions {
	binDir: string;
	arch: "arm64" | "x64";
	fetch?: Fetcher;
	extractZip?: (zipPath: string, destDir: string) => Promise<void>;
	readVersion?: (ghPath: string) => Promise<string>;
	isSignedByGitHub?: (binaryPath: string) => Promise<boolean>;
	onProgress?: (event: GhInstallEvent) => void;
	signal?: AbortSignal;
}

export function expectedSha256(
	checksums: string,
	assetName: string,
): string | null {
	for (const line of checksums.split("\n")) {
		const [hash, name] = line.trim().split(/\s+/);
		if (name === assetName && hash && /^[a-f0-9]{64}$/i.test(hash)) {
			return hash.toLowerCase();
		}
	}
	return null;
}

async function dittoExtract(zipPath: string, destDir: string): Promise<void> {
	await execFileAsync("/usr/bin/ditto", ["-x", "-k", zipPath, destDir]);
}

async function ghVersionOutput(ghPath: string): Promise<string> {
	const { stdout } = await execFileAsync(ghPath, ["--version"], {
		timeout: 10_000,
	});
	return stdout;
}

async function latestVersion(
	fetcher: Fetcher,
	signal?: AbortSignal,
): Promise<string> {
	const get = (url: string) =>
		fetcher(url, {
			headers: { "User-Agent": "Paradev-Desktop", ...GITHUB_API_HEADERS },
			signal,
		}).catch(() => {
			throw new InstallError("offline");
		});
	const api = await get(LATEST_RELEASE_API_URL);
	if (api.ok) {
		const release = (await api.json()) as { tag_name?: string };
		const version = release.tag_name?.replace(/^v/, "");
		if (version) return version;
		throw new InstallError("download");
	}
	if (api.status !== 403 && api.status !== 429) {
		throw new InstallError("download");
	}
	const page = await get(LATEST_RELEASE_PAGE_URL);
	const version = page.ok
		? page.url.match(/\/releases\/tag\/v([^/?#]+)/)?.[1]
		: undefined;
	if (!version) throw new InstallError("rate-limited");
	return version;
}

export function ghReleaseAssetUrl(version: string, assetName: string): string {
	return `https://github.com/cli/cli/releases/download/v${version}/${assetName}`;
}

/**
 * Installs the official macOS `gh` build into `binDir`, checked against the
 * release's SHA-256 and GitHub's Developer ID signature. The binary is fetched
 * by the app, not a browser, so it carries no quarantine flag for Gatekeeper.
 */
export async function installGhCli(
	options: InstallGhCliOptions,
): Promise<GhInstallEvent> {
	const fetcher = options.fetch ?? fetch;
	const extract = options.extractZip ?? dittoExtract;
	const readVersion = options.readVersion ?? ghVersionOutput;
	const isSignedByGitHub =
		options.isSignedByGitHub ??
		((binaryPath: string) => isSignedByTeam(binaryPath, TEAM_IDS.github));
	const emit = (event: GhInstallEvent) => options.onProgress?.(event);
	const arch = options.arch === "arm64" ? "arm64" : "amd64";
	let workDir: string | null = null;
	let downloadUrl: string | null = null;

	try {
		const version = await latestVersion(fetcher, options.signal);
		const assetName = `gh_${version}_macOS_${arch}.zip`;
		downloadUrl = ghReleaseAssetUrl(version, assetName);

		const checksums = await (
			await fetchOk(
				fetcher,
				ghReleaseAssetUrl(version, `gh_${version}_checksums.txt`),
				{ signal: options.signal },
			)
		).text();
		const expected = expectedSha256(checksums, assetName);
		if (!expected) throw new InstallError("checksum");

		workDir = await fs.mkdtemp(path.join(os.tmpdir(), "paradev-gh-"));
		const zipPath = path.join(workDir, assetName);
		await downloadVerified({
			fetch: fetcher,
			url: downloadUrl,
			destPath: zipPath,
			digest: { algorithm: "sha256", encoding: "hex", value: expected },
			signal: options.signal,
			onProgress: (receivedBytes, totalBytes) =>
				emit({ stage: "downloading", receivedBytes, totalBytes }),
		});

		emit({ stage: "verifying" });
		const extractDir = path.join(workDir, "extracted");
		await fs.mkdir(extractDir);
		await extract(zipPath, extractDir);
		const extractedBinary = path.join(
			extractDir,
			assetName.replace(/\.zip$/, ""),
			"bin",
			"gh",
		);
		if (!(await isSignedByGitHub(extractedBinary))) {
			throw new InstallError("signature");
		}

		emit({ stage: "installing" });
		const target = path.join(options.binDir, "gh");
		const staged = `${target}.${process.pid}.tmp`;
		await fs.mkdir(options.binDir, { recursive: true });
		await fs.copyFile(extractedBinary, staged);
		await fs.chmod(staged, 0o755);
		await fs.rename(staged, target);

		const installedVersion =
			(await readVersion(target)).match(/gh version (\S+)/)?.[1] ?? version;
		return { stage: "done", version: installedVersion };
	} catch (error) {
		return { stage: "failed", reason: installFailureOf(error), downloadUrl };
	} finally {
		if (workDir) {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	}
}
