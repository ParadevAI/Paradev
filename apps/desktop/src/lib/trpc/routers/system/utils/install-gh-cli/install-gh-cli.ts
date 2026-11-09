import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const LATEST_RELEASE_API_URL =
	"https://api.github.com/repos/cli/cli/releases/latest";
// Redirects to /releases/tag/v<version>, and is not under the API rate limit.
const LATEST_RELEASE_PAGE_URL = "https://github.com/cli/cli/releases/latest";

export type GhInstallFailure =
	| "offline"
	| "rate-limited"
	| "download"
	| "checksum"
	| "install";

export type GhInstallEvent =
	| { stage: "downloading"; receivedBytes: number; totalBytes: number | null }
	| { stage: "verifying" }
	| { stage: "installing" }
	| { stage: "done"; version: string }
	| {
			stage: "failed";
			reason: GhInstallFailure;
			/** The macOS zip for a manual download, when the version is known. */
			downloadUrl: string | null;
	  };

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export interface InstallGhCliOptions {
	binDir: string;
	arch?: string;
	fetch?: Fetcher;
	extractZip?: (zipPath: string, destDir: string) => Promise<void>;
	readVersion?: (ghPath: string) => Promise<string>;
	onProgress?: (event: GhInstallEvent) => void;
	signal?: AbortSignal;
}

class InstallFailure extends Error {
	constructor(readonly reason: GhInstallFailure) {
		super(reason);
	}
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

async function get(
	fetcher: Fetcher,
	url: string,
	signal?: AbortSignal,
): Promise<Response> {
	return fetcher(url, {
		headers: {
			Accept: "application/vnd.github+json",
			"User-Agent": "Paradev-Desktop",
		},
		signal,
	}).catch(() => {
		throw new InstallFailure("offline");
	});
}

async function getOk(
	fetcher: Fetcher,
	url: string,
	signal?: AbortSignal,
): Promise<Response> {
	const response = await get(fetcher, url, signal);
	if (!response.ok) throw new InstallFailure("download");
	return response;
}

async function latestVersion(
	fetcher: Fetcher,
	signal?: AbortSignal,
): Promise<string> {
	const api = await get(fetcher, LATEST_RELEASE_API_URL, signal);
	if (api.ok) {
		const release = (await api.json()) as { tag_name?: string };
		const version = release.tag_name?.replace(/^v/, "");
		if (version) return version;
		throw new InstallFailure("download");
	}
	if (api.status !== 403 && api.status !== 429) {
		throw new InstallFailure("download");
	}
	const page = await get(fetcher, LATEST_RELEASE_PAGE_URL, signal);
	const version = page.ok
		? page.url.match(/\/releases\/tag\/v([^/?#]+)/)?.[1]
		: undefined;
	if (!version) throw new InstallFailure("rate-limited");
	return version;
}

export function ghReleaseAssetUrl(version: string, assetName: string): string {
	return `https://github.com/cli/cli/releases/download/v${version}/${assetName}`;
}

/**
 * Installs the official macOS `gh` build into `binDir`. The binary is fetched
 * by the app, not a browser, so it carries no quarantine flag for Gatekeeper.
 */
export async function installGhCli(
	options: InstallGhCliOptions,
): Promise<GhInstallEvent> {
	const fetcher = options.fetch ?? fetch;
	const extract = options.extractZip ?? dittoExtract;
	const readVersion = options.readVersion ?? ghVersionOutput;
	const emit = (event: GhInstallEvent) => options.onProgress?.(event);
	const arch = (options.arch ?? process.arch) === "arm64" ? "arm64" : "amd64";
	let workDir: string | null = null;
	let downloadUrl: string | null = null;

	try {
		const version = await latestVersion(fetcher, options.signal);
		const assetName = `gh_${version}_macOS_${arch}.zip`;
		downloadUrl = ghReleaseAssetUrl(version, assetName);

		const checksums = await (
			await getOk(
				fetcher,
				ghReleaseAssetUrl(version, `gh_${version}_checksums.txt`),
				options.signal,
			)
		).text();
		const expected = expectedSha256(checksums, assetName);
		if (!expected) throw new InstallFailure("checksum");

		const zipResponse = await getOk(fetcher, downloadUrl, options.signal);
		const totalBytes =
			Number(zipResponse.headers.get("content-length")) || null;
		const hash = createHash("sha256");
		const chunks: Uint8Array[] = [];
		let receivedBytes = 0;
		emit({ stage: "downloading", receivedBytes, totalBytes });
		const reader = zipResponse.body?.getReader();
		if (!reader) throw new InstallFailure("download");
		for (;;) {
			const { done, value } = await reader.read().catch(() => {
				throw new InstallFailure("download");
			});
			if (done) break;
			chunks.push(value);
			hash.update(value);
			receivedBytes += value.byteLength;
			emit({ stage: "downloading", receivedBytes, totalBytes });
		}

		emit({ stage: "verifying" });
		if (hash.digest("hex") !== expected) throw new InstallFailure("checksum");

		emit({ stage: "installing" });
		workDir = await fs.mkdtemp(path.join(os.tmpdir(), "paradev-gh-"));
		const zipPath = path.join(workDir, assetName);
		const extractDir = path.join(workDir, "extracted");
		await fs.writeFile(zipPath, Buffer.concat(chunks));
		await fs.mkdir(extractDir);
		await extract(zipPath, extractDir);

		const extractedBinary = path.join(
			extractDir,
			assetName.replace(/\.zip$/, ""),
			"bin",
			"gh",
		);
		const target = path.join(options.binDir, "gh");
		const staged = `${target}.${process.pid}.tmp`;
		await fs.mkdir(options.binDir, { recursive: true });
		await fs.copyFile(extractedBinary, staged);
		await fs.chmod(staged, 0o755);
		await fs.rename(staged, target);

		const installedVersion =
			(await readVersion(target)).match(/gh version (\S+)/)?.[1] ?? version;
		const done: GhInstallEvent = { stage: "done", version: installedVersion };
		emit(done);
		return done;
	} catch (error) {
		const failed: GhInstallEvent = {
			stage: "failed",
			reason: error instanceof InstallFailure ? error.reason : "install",
			downloadUrl,
		};
		emit(failed);
		return failed;
	} finally {
		if (workDir) {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	}
}
