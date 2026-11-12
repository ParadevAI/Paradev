import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
	downloadVerified,
	type Fetcher,
	fetchOk,
	InstallError,
} from "../../../utils/download-verified";
import { type AgentInstallEvent, toFailedEvent } from "../agent-install-event";

export const CLAUDE_RELEASES_URL =
	"https://downloads.claude.ai/claude-code-releases";

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export interface InstallClaudeCodeOptions {
	fetch: Fetcher;
	/** The path `claude install` sets up, `~/.local/bin/claude`. */
	installedPath: string;
	arch: "arm64" | "x64";
	workRoot?: string;
	verifySignature: (binaryPath: string) => Promise<boolean>;
	/**
	 * Runs the downloaded binary's own `install` with no target, as Anthropic's
	 * install.sh does unless the user names one, so the install keeps its
	 * channel and updates itself.
	 */
	runInstall: (binaryPath: string, args: string[]) => Promise<void>;
	readVersion: (binaryPath: string) => Promise<string | null>;
	onProgress?: (event: AgentInstallEvent) => void;
	signal?: AbortSignal;
}

export function claudePlatform(arch: "arm64" | "x64"): string {
	return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
}

export function manifestChecksum(
	manifest: unknown,
	platform: string,
): string | null {
	const checksum = (
		manifest as { platforms?: Record<string, { checksum?: unknown }> }
	)?.platforms?.[platform]?.checksum;
	return typeof checksum === "string" && /^[a-f0-9]{64}$/.test(checksum)
		? checksum
		: null;
}

/**
 * Anthropic's native install without its shell script: the binary named in
 * the release manifest, checked against the manifest's SHA-256 and Anthropic's
 * code signature, then set up by its own `claude install`.
 */
export async function installClaudeCode(
	options: InstallClaudeCodeOptions,
): Promise<AgentInstallEvent> {
	const emit = (event: AgentInstallEvent) => options.onProgress?.(event);
	const platform = claudePlatform(options.arch);
	let workDir: string | null = null;
	try {
		const version = (
			await (
				await fetchOk(options.fetch, `${CLAUDE_RELEASES_URL}/latest`, {
					signal: options.signal,
				})
			).text()
		).trim();
		if (!VERSION_PATTERN.test(version)) throw new InstallError("download");

		const manifest = await (
			await fetchOk(
				options.fetch,
				`${CLAUDE_RELEASES_URL}/${version}/manifest.json`,
				{ signal: options.signal },
			)
		)
			.json()
			.catch(() => null);
		const checksum = manifestChecksum(manifest, platform);
		if (!checksum) throw new InstallError("checksum");

		workDir = await fs.mkdtemp(
			path.join(options.workRoot ?? os.tmpdir(), "paradev-claude-"),
		);
		const binaryPath = path.join(workDir, "claude");
		await downloadVerified({
			fetch: options.fetch,
			url: `${CLAUDE_RELEASES_URL}/${version}/${platform}/claude`,
			destPath: binaryPath,
			digest: { algorithm: "sha256", encoding: "hex", value: checksum },
			signal: options.signal,
			onProgress: (receivedBytes, totalBytes) =>
				emit({ stage: "downloading", receivedBytes, totalBytes }),
		});

		emit({ stage: "verifying" });
		await fs.chmod(binaryPath, 0o755);
		if (!(await options.verifySignature(binaryPath))) {
			throw new InstallError("signature");
		}

		emit({ stage: "installing" });
		await options.runInstall(binaryPath, ["install"]);
		const installedVersion = await options.readVersion(options.installedPath);
		if (!installedVersion) throw new InstallError("install");
		return {
			stage: "done",
			version: installedVersion,
			path: options.installedPath,
		};
	} catch (error) {
		return toFailedEvent(error);
	} finally {
		if (workDir) {
			await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
		}
	}
}
