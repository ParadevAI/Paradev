import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";
import { createGunzip } from "node:zlib";
import { MAX_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
import { TRPCError } from "@trpc/server";
import { downloadAttachment } from "../../trpc/router/attachments/download";
import type { ApiClient } from "../../types";
import { type BundleManifest, parseBundleManifest } from "../providers";

const execFileAsync = promisify(execFile);
const MANIFEST = "manifest.json";
const MAX_EXPANDED_BYTES = 1024 * 1024 * 1024;

/** A scratch directory removed once `run` settles. */
export async function withStage<T>(
	run: (stageDir: string) => Promise<T>,
): Promise<T> {
	const stageDir = await mkdtemp(join(tmpdir(), "superset-teleport-"));
	try {
		return await run(stageDir);
	} finally {
		await rm(stageDir, { recursive: true, force: true });
	}
}

/** Packs a staged session and uploads it as the chat's newest bundle. */
export async function uploadBundle(args: {
	api: ApiClient;
	chatSessionId: string;
	harness: string;
	manifest: BundleManifest;
	stageDir: string;
}): Promise<string> {
	await writeFile(join(args.stageDir, MANIFEST), JSON.stringify(args.manifest));
	const archive = `${args.stageDir}.tar.gz`;
	try {
		await writeFile(archive, "", { mode: 0o600 });
		await execFileAsync("tar", ["-czf", archive, "-C", args.stageDir, "."]);
		const { size } = await stat(archive);
		if (size > MAX_ATTACHMENT_BYTES) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: "This conversation is too large to move to the cloud",
			});
		}
		const bytes = await readFile(archive);
		const { transcriptId, upload } =
			await args.api.chatHistory.createTranscriptUpload.mutate({
				sessionId: args.chatSessionId,
				harness: args.harness,
				harnessSessionId: args.manifest.harnessSessionId,
				sourceCwd: args.manifest.sourceCwd,
				sizeBytes: size,
				sha256: createHash("sha256").update(bytes).digest("hex"),
			});
		const response = await fetch(upload.url, {
			method: "PUT",
			headers: upload.headers,
			body: bytes,
		});
		if (!response.ok) {
			throw new TRPCError({
				code: "BAD_GATEWAY",
				message: `Could not upload the conversation (${response.status})`,
			});
		}
		await args.api.chatHistory.completeTranscriptUpload.mutate({
			transcriptId,
		});
		return transcriptId;
	} finally {
		await rm(archive, { force: true });
	}
}

export type BundleSource = {
	url: string;
	sha256: string;
	byteLength: number;
	harnessSessionId: string;
};

/** Unzips `archive` to `tarPath`, failing once it grows past `maxBytes`. */
export async function gunzipBounded(
	archive: string,
	tarPath: string,
	maxBytes = MAX_EXPANDED_BYTES,
): Promise<void> {
	let total = 0;
	const bound = new Transform({
		transform(chunk: Buffer, _encoding, done) {
			total += chunk.length;
			if (total > maxBytes) {
				done(new Error("The session bundle is too large to unpack"));
				return;
			}
			done(null, chunk);
		},
	});
	await pipeline(
		createReadStream(archive),
		createGunzip(),
		bound,
		createWriteStream(tarPath, { mode: 0o600 }),
	);
}

/**
 * Refuses an archive with anything but files and folders inside its own
 * root: another host packed it, and a link or `..` entry would let it write
 * outside the folder it is unpacked into.
 */
export async function assertPlainEntries(tarPath: string): Promise<void> {
	const [{ stdout: names }, { stdout: listing }] = await Promise.all([
		execFileAsync("tar", ["-tf", tarPath], { maxBuffer: 64 * 1024 * 1024 }),
		execFileAsync("tar", ["-tvf", tarPath], { maxBuffer: 64 * 1024 * 1024 }),
	]);
	const unsafeName = names
		.split("\n")
		.filter(Boolean)
		.some(
			(name) =>
				name.startsWith("/") || name.split("/").some((part) => part === ".."),
		);
	const unsafeType = listing
		.split("\n")
		.filter(Boolean)
		.some((line) => line[0] !== "-" && line[0] !== "d");
	if (unsafeName || unsafeType) {
		throw new Error("The session bundle has entries this host will not unpack");
	}
}

/** Downloads a bundle into `stageDir` and checks it arrived whole. */
export async function downloadBundle(args: {
	bundle: BundleSource;
	stageDir: string;
}): Promise<BundleManifest> {
	const { bundle } = args;
	const archive = `${args.stageDir}.tar.gz`;
	const tarPath = `${args.stageDir}.tar`;
	try {
		await downloadAttachment(
			{
				fileId: bundle.harnessSessionId,
				name: `${bundle.harnessSessionId}.tar.gz`,
				contentType: "application/gzip",
				sizeBytes: bundle.byteLength,
				url: bundle.url,
			},
			archive,
		);
		const bytes = await readFile(archive);
		if (createHash("sha256").update(bytes).digest("hex") !== bundle.sha256) {
			throw new Error("The downloaded session bundle is damaged");
		}
		await gunzipBounded(archive, tarPath);
		await assertPlainEntries(tarPath);
		await execFileAsync("tar", ["-xf", tarPath, "-C", args.stageDir]);
		const manifest = parseBundleManifest(
			JSON.parse(await readFile(join(args.stageDir, MANIFEST), "utf8")),
		);
		if (manifest?.harnessSessionId !== bundle.harnessSessionId) {
			throw new Error("The session bundle is not one this host can read");
		}
		return manifest;
	} finally {
		await rm(archive, { force: true });
		await rm(tarPath, { force: true });
	}
}
