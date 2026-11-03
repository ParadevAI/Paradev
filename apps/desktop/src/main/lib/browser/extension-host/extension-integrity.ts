import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { toExtensionId } from "./crx3";
import { readZipEntry } from "./read-zip-entry";
import {
	isExtensionPage,
	STORAGE_SHIM_SCRIPT,
	shimManifestText,
	storageShimSource,
	unshimPage,
} from "./storage-shim-files";

// Chromium's kWebstoreSignaturesPublicKey (extensions/common/constants.cc): the
// Web Store signs each CRX's _metadata/verified_contents.json with this RSA key.
const WEB_STORE_CONTENTS_KEY = createPublicKey({
	key: Buffer.from(
		"30820122300d06092a864886f70d01010105000382010f003082010a0282010100" +
			"8ffbbf5c3763943cb0ee01c4b5a69ab19f46746f1638a0322735ddf0716b0edc" +
			"f625cbb2edeafb32d5af1e03430346f0a739db23961d65e57851f084b00e12ac" +
			"0e5bdcc9d64c7c00d5b81b88333e2fdaebaaf71a75c2ae3a54de378f10d228e6" +
			"84794d15b4f3bd3f56d33c3f18abfc2e05c01e0831b661d0fd9f4f3f640d1793" +
			"bcad41c748be0027a84d7042920554a66db8de566e204970ee103e6bd27c31bd" +
			"1b6ea43c46629f086693f92a5131a8dbb59db90f73e8a0093201e97b2a8a36a0" +
			"cf17b050709da2f9a46f624db6c931fcf30812ff93bd6231d81cea1a9ef58128" +
			"7f755ed2277ac296f59ddb18fc76dc46f057c05834c8222d2a6575a7d90862cd" +
			"0203010001",
		"hex",
	),
	format: "der",
	type: "spki",
});

const MANIFEST = "manifest.json";
// Electron deletes this folder from the extension on every load.
const METADATA_DIR = "_metadata";
const VERIFIED_CONTENTS = `${METADATA_DIR}/verified_contents.json`;
const SHA256_BYTES = 32;
const PARALLEL_READS = 8;
const VERSION = /^\d+(\.\d+){0,3}$/;

/** A file of the extension differs from its record. */
export class ExtensionIntegrityError extends Error {}

const verifiedContentsSchema = z.array(
	z.object({
		description: z.string().optional(),
		signed_content: z
			.object({
				payload: z.string(),
				signatures: z.array(
					z.object({
						protected: z.string(),
						signature: z.string(),
						header: z.object({ kid: z.string().optional() }).optional(),
					}),
				),
			})
			.optional(),
	}),
);

const payloadSchema = z.object({
	item_id: z.string(),
	item_version: z.string().regex(VERSION),
	content_hashes: z.array(
		z.object({
			format: z.string(),
			block_size: z.number().int().optional(),
			hash_block_size: z.number().int().optional(),
			files: z
				.array(z.object({ path: z.string(), root_hash: z.string() }))
				.optional(),
		}),
	),
});

const recordSchema = z.union([
	z.object({ manifest: z.string(), verifiedContents: z.string() }),
	z.object({
		fileSha256: z.record(z.string(), z.string()),
		manifest: z.string().optional(),
	}),
]);
type FilesRecord = z.infer<typeof recordSchema>;

interface SignedContents {
	id: string;
	version: string;
	blockSize: number;
	rootHashes: Map<string, string[]>;
}

type UsableRecord =
	| { kind: "signed"; signed: SignedContents; manifest: Buffer }
	| {
			kind: "trusted";
			fileSha256: Record<string, string>;
			manifest: Buffer | null;
	  };

/**
 * Checks an unpacked extension against its record and throws
 * `ExtensionIntegrityError` on a difference. The signed record saved at
 * install holds the Web Store's hashes; without a usable record, the current
 * files are recorded as trusted and the result is "recorded". Other errors mean
 * the files could not be checked.
 */
export async function checkExtensionFiles(
	dir: string,
	options: { extensionId: string; version: string; manifestsPath: string },
): Promise<"verified" | "recorded"> {
	const file = recordPath(
		options.manifestsPath,
		options.extensionId,
		options.version,
	);
	const record = await readUsableRecord(file, options);
	const { files, others } = await listFiles(dir);
	if (!record) {
		if (others[0]) {
			throw new ExtensionIntegrityError(`${others[0]} is not a plain file`);
		}
		const hashes: [string, string][] = [];
		const extensionFiles = files.filter(
			(relative) => relative !== STORAGE_SHIM_SCRIPT,
		);
		await forEachLimited(extensionFiles, PARALLEL_READS, async (relative) => {
			hashes.push([
				relative,
				sha256(await readOriginal(dir, relative)).toString("hex"),
			]);
		});
		const manifest = await readFile(path.join(dir, MANIFEST));
		await saveTrustedRecord(file, Object.fromEntries(hashes), manifest);
		return "recorded";
	}
	if (others[0]) {
		throw new ExtensionIntegrityError(`${others[0]} is not a plain file`);
	}
	await verifyStorageShim(dir, files);
	const extensionFiles = files.filter(
		(relative) => relative !== STORAGE_SHIM_SCRIPT,
	);
	if (record.kind === "signed") {
		await verifySignedFiles(
			dir,
			extensionFiles,
			record.signed,
			record.manifest,
		);
	} else {
		await verifyTrustedFiles(dir, extensionFiles, record);
		if (!record.manifest) {
			// Records from before the storage shim keep only a hash; the
			// manifest just matched it, so keep its text for the shimmed form.
			await saveTrustedRecord(
				file,
				record.fileSha256,
				await readFile(path.join(dir, MANIFEST)),
			);
		}
	}
	return "verified";
}

async function saveTrustedRecord(
	file: string,
	fileSha256: Record<string, string>,
	manifest: Buffer,
): Promise<void> {
	await mkdir(path.dirname(file), { recursive: true });
	const trusted: FilesRecord = {
		fileSha256,
		manifest: manifest.toString("base64"),
	};
	await writeFile(file, JSON.stringify(trusted));
}

/** The app's own shim file is exactly the app's current copy. */
async function verifyStorageShim(dir: string, files: string[]): Promise<void> {
	if (!files.includes(STORAGE_SHIM_SCRIPT)) return;
	const shim = await readFile(path.join(dir, STORAGE_SHIM_SCRIPT));
	if (!shim.equals(storageShimSource())) {
		throw new ExtensionIntegrityError(`${STORAGE_SHIM_SCRIPT} changed`);
	}
}

/** A file's bytes with the app's storage shim tag taken back out of a page. */
async function readOriginal(dir: string, relative: string): Promise<Buffer> {
	const content = await readFile(path.join(dir, relative));
	return isExtensionPage(relative) ? unshimPage(content) : content;
}

/** The manifest is the original, or the original with the storage shim added. */
function isManifestOrShimmed(onDisk: Buffer, original: Buffer): boolean {
	if (onDisk.equals(original)) return true;
	try {
		const shimmed = shimManifestText(original.toString("utf8"));
		return Buffer.from(shimmed).equals(onDisk);
	} catch {
		return false;
	}
}

/**
 * Saves the CRX's own manifest.json, which the package rewrites when it
 * unpacks, and its signed hashes, which Electron deletes when it loads.
 */
export function saveSignedRecord(
	crx: Buffer,
	extensionId: string,
	manifestsPath: string,
): void {
	const archive = crx.subarray(12 + crx.readUInt32LE(8));
	const manifest = readZipEntry(archive, MANIFEST);
	if (!manifest) throw new Error("CRX has no manifest.json");
	const version: unknown = JSON.parse(manifest.toString("utf8")).version;
	if (typeof version !== "string" || !VERSION.test(version)) {
		throw new Error("CRX manifest has no valid version");
	}
	const file = recordPath(manifestsPath, extensionId, version);
	const verifiedContents = readZipEntry(archive, VERIFIED_CONTENTS);
	if (!verifiedContents) {
		try {
			unlinkSync(file);
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
		return;
	}
	mkdirSync(path.dirname(file), { recursive: true });
	const record: FilesRecord = {
		manifest: manifest.toString("base64"),
		verifiedContents: verifiedContents.toString("utf8"),
	};
	writeFileSync(file, JSON.stringify(record));
}

/** Chromium's ComputeTreeHashRoot over SHA-256 block hashes, as base64url. */
export function treeHashRoot(content: Buffer, blockSize: number): string {
	let level: Buffer[] = [];
	let offset = 0;
	do {
		level.push(sha256(content.subarray(offset, offset + blockSize)));
		offset += blockSize;
	} while (offset < content.length);
	const branchFactor = blockSize / SHA256_BYTES;
	while (level.length > 1) {
		const parents: Buffer[] = [];
		for (let index = 0; index < level.length; index += branchFactor) {
			parents.push(
				sha256(Buffer.concat(level.slice(index, index + branchFactor))),
			);
		}
		level = parents;
	}
	return (level[0] as Buffer).toString("base64url");
}

export function recordPath(
	manifestsPath: string,
	extensionId: string,
	version: string,
): string {
	return path.join(manifestsPath, extensionId, `${version}.json`);
}

async function readUsableRecord(
	file: string,
	options: { extensionId: string; version: string },
): Promise<UsableRecord | null> {
	let text: string;
	try {
		text = await readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	const json = parseJson(text);
	const parsed = recordSchema.safeParse(json);
	if (!parsed.success) {
		console.error(`[extension-host] Ignoring malformed record ${file}`);
		return null;
	}
	if ("fileSha256" in parsed.data) {
		const manifest = parsed.data.manifest
			? Buffer.from(parsed.data.manifest, "base64")
			: null;
		// zod drops a `__proto__` key, which is a valid file name.
		const { fileSha256 } = json as { fileSha256: Record<string, unknown> };
		const recorded = parsed.data.fileSha256[MANIFEST];
		return {
			kind: "trusted",
			fileSha256: Object.fromEntries(
				Object.entries(fileSha256).map(([name, hash]) => [name, String(hash)]),
			),
			manifest:
				manifest && sha256(manifest).toString("hex") === recorded
					? manifest
					: null,
		};
	}
	const manifest = Buffer.from(parsed.data.manifest, "base64");
	const signed = readSignedContents(parsed.data.verifiedContents);
	const problem = !signed
		? "its Web Store signature does not verify"
		: signed.id !== options.extensionId || signed.version !== options.version
			? "it is for another extension or version"
			: !signed.rootHashes
						.get(canonicalPath(MANIFEST))
						?.includes(treeHashRoot(manifest, signed.blockSize))
				? "its manifest is not the signed one"
				: null;
	if (problem || !signed) {
		console.error(`[extension-host] Ignoring record ${file}: ${problem}`);
		return null;
	}
	return { kind: "signed", signed, manifest };
}

async function verifySignedFiles(
	dir: string,
	files: string[],
	signed: SignedContents,
	originalManifest: Buffer,
): Promise<void> {
	const unchecked = new Set(signed.rootHashes.keys());
	unchecked.delete(canonicalPath(MANIFEST));
	await forEachLimited(
		files.filter((file) => file !== MANIFEST),
		PARALLEL_READS,
		async (file) => {
			const key = canonicalPath(file);
			const expected = signed.rootHashes.get(key);
			if (!expected) {
				throw new ExtensionIntegrityError(
					`${file} is not in its signed hashes`,
				);
			}
			const actual = treeHashRoot(
				await readOriginal(dir, file),
				signed.blockSize,
			);
			if (!expected.includes(actual)) {
				throw new ExtensionIntegrityError(`${file} changed`);
			}
			unchecked.delete(key);
		},
	);
	const missing = unchecked.values().next().value;
	if (missing !== undefined) {
		throw new ExtensionIntegrityError(`${missing} is missing`);
	}

	const onDisk = await readFile(path.join(dir, MANIFEST)).catch(
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") {
				throw new ExtensionIntegrityError(`${MANIFEST} is missing`);
			}
			throw error;
		},
	);
	const manifest = parseJson(onDisk.toString("utf8")) as {
		key?: unknown;
	} | null;
	if (
		typeof manifest?.key !== "string" ||
		toExtensionId(
			sha256(Buffer.from(manifest.key, "base64")).subarray(0, 16),
		) !== signed.id
	) {
		throw new ExtensionIntegrityError(`${MANIFEST} has a different key`);
	}
	// The package's own rewrite: the original, with `key` set.
	const expected = JSON.parse(originalManifest.toString("utf8"));
	expected.key = manifest.key;
	if (
		!isManifestOrShimmed(onDisk, Buffer.from(JSON.stringify(expected, null, 2)))
	) {
		throw new ExtensionIntegrityError(`${MANIFEST} changed`);
	}
}

async function verifyTrustedFiles(
	dir: string,
	files: string[],
	{
		fileSha256,
		manifest,
	}: { fileSha256: Record<string, string>; manifest: Buffer | null },
): Promise<void> {
	const unchecked = new Set(Object.keys(fileSha256));
	await forEachLimited(files, PARALLEL_READS, async (file) => {
		const expected = Object.hasOwn(fileSha256, file)
			? fileSha256[file]
			: undefined;
		if (!expected) {
			throw new ExtensionIntegrityError(`${file} was added`);
		}
		const content = await readOriginal(dir, file);
		const matches =
			sha256(content).toString("hex") === expected ||
			(file === MANIFEST &&
				!!manifest &&
				isManifestOrShimmed(content, manifest));
		if (!matches) {
			throw new ExtensionIntegrityError(`${file} changed`);
		}
		unchecked.delete(file);
	});
	const missing = unchecked.values().next().value;
	if (missing !== undefined) {
		throw new ExtensionIntegrityError(`${missing} is missing`);
	}
}

function readSignedContents(json: string): SignedContents | null {
	const parsed = verifiedContentsSchema.safeParse(parseJson(json));
	const signedContent = parsed.success
		? parsed.data.find((entry) => entry.description === "treehash per file")
				?.signed_content
		: undefined;
	const webStore = signedContent?.signatures.find(
		(signature) => signature.header?.kid === "webstore",
	);
	if (
		!signedContent ||
		!webStore ||
		!verify(
			"sha256",
			Buffer.from(`${webStore.protected}.${signedContent.payload}`),
			WEB_STORE_CONTENTS_KEY,
			Buffer.from(webStore.signature, "base64url"),
		)
	) {
		return null;
	}

	const payload = payloadSchema.safeParse(
		parseJson(Buffer.from(signedContent.payload, "base64url").toString("utf8")),
	);
	const treeHashes = payload.success
		? payload.data.content_hashes.find((hashes) => hashes.format === "treehash")
		: undefined;
	const blockSize = treeHashes?.block_size;
	if (
		!payload.success ||
		!treeHashes?.files ||
		!blockSize ||
		blockSize !== treeHashes.hash_block_size ||
		blockSize < 2 * SHA256_BYTES ||
		blockSize % SHA256_BYTES !== 0
	) {
		return null;
	}
	const rootHashes = new Map<string, string[]>();
	for (const file of treeHashes.files) {
		const key = canonicalPath(file.path);
		const root = Buffer.from(file.root_hash, "base64url").toString("base64url");
		rootHashes.set(key, [...(rootHashes.get(key) ?? []), root]);
	}
	return {
		id: payload.data.item_id,
		version: payload.data.item_version,
		blockSize,
		rootHashes,
	};
}

function parseJson(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}

// Chromium folds case where the file system does (content_verifier_utils.cc).
function canonicalPath(relativePath: string): string {
	const unix = relativePath.replaceAll("\\", "/");
	return process.platform === "darwin" || process.platform === "win32"
		? unix.toLowerCase()
		: unix;
}

/** Relative paths of plain files outside `_metadata`, and of anything else such as links. */
async function listFiles(
	root: string,
	relative = "",
): Promise<{ files: string[]; others: string[] }> {
	const entries = await readdir(path.join(root, relative), {
		withFileTypes: true,
	});
	const found = { files: [] as string[], others: [] as string[] };
	for (const entry of entries) {
		const entryPath = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			if (entryPath === METADATA_DIR) continue;
			const nested = await listFiles(root, entryPath);
			found.files.push(...nested.files);
			found.others.push(...nested.others);
		} else if (entry.isFile()) {
			found.files.push(entryPath);
		} else {
			found.others.push(entryPath);
		}
	}
	return found;
}

async function forEachLimited<T>(
	items: T[],
	limit: number,
	run: (item: T) => Promise<void>,
): Promise<void> {
	let next = 0;
	const worker = async () => {
		while (next < items.length) await run(items[next++] as T);
	};
	await Promise.all(Array.from({ length: limit }, worker));
}

function sha256(data: Buffer): Buffer {
	return createHash("sha256").update(data).digest();
}
