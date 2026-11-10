import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type AgentInstallFailure =
	| "unsupported"
	| "offline"
	| "download"
	| "checksum"
	| "signature"
	| "install";

export type AgentInstallEvent =
	| { stage: "downloading"; receivedBytes: number; totalBytes: number | null }
	| { stage: "verifying" }
	| { stage: "installing" }
	| { stage: "done"; version: string; path: string }
	| { stage: "failed"; reason: AgentInstallFailure };

export class AgentInstallError extends Error {
	constructor(readonly reason: AgentInstallFailure) {
		super(reason);
	}
}

export async function fetchOk(
	fetcher: Fetcher,
	url: string,
	signal?: AbortSignal,
): Promise<Response> {
	const response = await fetcher(url, {
		headers: { "User-Agent": "Paradev-Desktop" },
		signal,
	}).catch(() => {
		throw new AgentInstallError("offline");
	});
	if (!response.ok) throw new AgentInstallError("download");
	return response;
}

export interface ExpectedDigest {
	algorithm: "sha256" | "sha512";
	encoding: "hex" | "base64";
	value: string;
}

/** npm's `dist.integrity` (`sha512-<base64>`) as a digest to check. */
export function parseIntegrity(integrity: unknown): ExpectedDigest | null {
	if (typeof integrity !== "string") return null;
	for (const entry of integrity.trim().split(/\s+/)) {
		const match = entry.match(/^sha512-([A-Za-z0-9+/]+={0,2})$/);
		if (match?.[1]) {
			return { algorithm: "sha512", encoding: "base64", value: match[1] };
		}
	}
	return null;
}

/**
 * Streams `url` to `destPath` and hashes it on the way. The file is kept only
 * when the hash matches.
 */
export async function downloadVerified(options: {
	fetch: Fetcher;
	url: string;
	destPath: string;
	digest: ExpectedDigest;
	signal?: AbortSignal;
	onProgress?: (receivedBytes: number, totalBytes: number | null) => void;
}): Promise<void> {
	const response = await fetchOk(options.fetch, options.url, options.signal);
	const totalBytes = Number(response.headers.get("content-length")) || null;
	const reader = response.body?.getReader();
	if (!reader) throw new AgentInstallError("download");
	const hash = createHash(options.digest.algorithm);
	const file = await fs.open(options.destPath, "w");
	let receivedBytes = 0;
	try {
		options.onProgress?.(receivedBytes, totalBytes);
		for (;;) {
			const { done, value } = await reader.read().catch(() => {
				throw new AgentInstallError("download");
			});
			if (done) break;
			hash.update(value);
			await file.write(value);
			receivedBytes += value.byteLength;
			options.onProgress?.(receivedBytes, totalBytes);
		}
	} finally {
		await file.close();
	}
	if (hash.digest(options.digest.encoding) !== options.digest.value) {
		await fs.rm(options.destPath, { force: true });
		throw new AgentInstallError("checksum");
	}
}

export function toFailedEvent(error: unknown): AgentInstallEvent {
	return {
		stage: "failed",
		reason: error instanceof AgentInstallError ? error.reason : "install",
	};
}
