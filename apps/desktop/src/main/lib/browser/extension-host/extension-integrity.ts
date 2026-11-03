import { createHash, createPublicKey, verify } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { toExtensionId } from "./crx3";
import { readZipEntry } from "./read-zip-entry";

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
const METADATA_DIR = "_metadata";
const VERIFIED_CONTENTS = `${METADATA_DIR}/verified_contents.json`;
const SHA256_BYTES = 32;
const PARALLEL_READS = 8;
const VERSION = /^\d+(\.\d+){0,3}$/;

/** The files on disk are not the ones the Web Store signed. */
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
	z.object({ manifest: z.string() }),
	z.object({ manifestSha256: z.string() }),
]);
type ManifestRecord = z.infer<typeof recordSchema>;

interface SignedContents {
	id: string;
	version: string;
	blockSize: number;
	rootHashes: Map<string, string[]>;
}

/**
 * Checks an unpacked Web Store extension against the hashes the Web Store
 * signed, as Chrome's content verifier does, and throws
 * `ExtensionIntegrityError` when they differ. The package rewrites
 * manifest.json to add `key`, so it is checked against the original saved by
 * `saveSignedManifest` instead. With `trustUnsavedManifest`, a version that has
 * no saved original has its current manifest.json recorded as trusted.
 */
export async function verifyExtensionFiles(
	dir: string,
	options: {
		extensionId: string;
		manifestsPath: string;
		trustUnsavedManifest: boolean;
	},
): Promise<{ version: string }> {
	const signed = readSignedContents(
		await readFile(path.join(dir, VERIFIED_CONTENTS), "utf8").catch(
			(error: unknown) => {
				throw isMissing(error)
					? new ExtensionIntegrityError("it has no Web Store signed hashes")
					: error;
			},
		),
	);
	if (signed.id !== options.extensionId) {
		throw new ExtensionIntegrityError(`its signed hashes are for ${signed.id}`);
	}
	const files = (await listFiles(dir)).filter(
		(file) => file !== MANIFEST && !file.startsWith(`${METADATA_DIR}/`),
	);
	const unchecked = new Set(signed.rootHashes.keys());
	unchecked.delete(canonicalPath(MANIFEST));
	await forEachLimited(files, PARALLEL_READS, async (file) => {
		const key = canonicalPath(file);
		const expected = signed.rootHashes.get(key);
		if (!expected) {
			throw new ExtensionIntegrityError(`${file} is not in its signed hashes`);
		}
		const actual = treeHashRoot(
			await readFile(path.join(dir, file)),
			signed.blockSize,
		);
		if (!expected.includes(actual)) {
			throw new ExtensionIntegrityError(`${file} changed`);
		}
		unchecked.delete(key);
	});
	const missing = unchecked.values().next().value;
	if (missing !== undefined) {
		throw new ExtensionIntegrityError(`${missing} is missing`);
	}
	await verifyManifest(dir, signed, options);
	return { version: signed.version };
}

/** Saves the CRX's own manifest.json, which the package rewrites when it unpacks. */
export function saveSignedManifest(
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
	mkdirSync(path.dirname(file), { recursive: true });
	const record: ManifestRecord = { manifest: manifest.toString("base64") };
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

async function verifyManifest(
	dir: string,
	signed: SignedContents,
	options: { manifestsPath: string; trustUnsavedManifest: boolean },
): Promise<void> {
	const onDisk = await readFile(path.join(dir, MANIFEST));
	let manifest: { key?: unknown; version?: unknown };
	try {
		manifest = JSON.parse(onDisk.toString("utf8"));
	} catch {
		throw new ExtensionIntegrityError(`${MANIFEST} is not valid JSON`);
	}
	if (
		typeof manifest.key !== "string" ||
		toExtensionId(
			sha256(Buffer.from(manifest.key, "base64")).subarray(0, 16),
		) !== signed.id
	) {
		throw new ExtensionIntegrityError(`${MANIFEST} has a different key`);
	}
	if (manifest.version !== signed.version) {
		throw new ExtensionIntegrityError(`${MANIFEST} has a different version`);
	}

	const file = recordPath(options.manifestsPath, signed.id, signed.version);
	const record = await readRecord(file);
	if (record && "manifest" in record) {
		const original = Buffer.from(record.manifest, "base64");
		const signedRoots = signed.rootHashes.get(canonicalPath(MANIFEST)) ?? [];
		if (!signedRoots.includes(treeHashRoot(original, signed.blockSize))) {
			throw new ExtensionIntegrityError(
				`the saved ${MANIFEST} is not the signed one`,
			);
		}
		// The package's own rewrite: the original, with `key` set.
		const expected = JSON.parse(original.toString("utf8"));
		expected.key = manifest.key;
		if (!Buffer.from(JSON.stringify(expected, null, 2)).equals(onDisk)) {
			throw new ExtensionIntegrityError(`${MANIFEST} changed`);
		}
		return;
	}
	const digest = sha256(onDisk).toString("hex");
	if (record) {
		if (record.manifestSha256 !== digest) {
			throw new ExtensionIntegrityError(`${MANIFEST} changed`);
		}
		return;
	}
	if (!options.trustUnsavedManifest) {
		throw new ExtensionIntegrityError(`${MANIFEST} has no saved copy`);
	}
	await mkdir(path.dirname(file), { recursive: true });
	const trusted: ManifestRecord = { manifestSha256: digest };
	await writeFile(file, JSON.stringify(trusted));
}

async function readRecord(file: string): Promise<ManifestRecord | null> {
	let text: string;
	try {
		text = await readFile(file, "utf8");
	} catch (error) {
		if (isMissing(error)) return null;
		throw error;
	}
	const record = recordSchema.safeParse(parseJson(text));
	if (!record.success) {
		throw new ExtensionIntegrityError("its saved manifest record is malformed");
	}
	return record.data;
}

function readSignedContents(json: string): SignedContents {
	const parsed = verifiedContentsSchema.safeParse(parseJson(json));
	const signedContent = parsed.success
		? parsed.data.find((entry) => entry.description === "treehash per file")
				?.signed_content
		: undefined;
	const webStore = signedContent?.signatures.find(
		(signature) => signature.header?.kid === "webstore",
	);
	if (!signedContent || !webStore) {
		throw new ExtensionIntegrityError("it has no Web Store signature");
	}
	const signatureValid = verify(
		"sha256",
		Buffer.from(`${webStore.protected}.${signedContent.payload}`),
		WEB_STORE_CONTENTS_KEY,
		Buffer.from(webStore.signature, "base64url"),
	);
	if (!signatureValid) {
		throw new ExtensionIntegrityError(
			"its Web Store signature does not verify",
		);
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
		throw new ExtensionIntegrityError("its signed hashes are malformed");
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

/** Relative paths of every file; a link or special file fails the check. */
async function listFiles(root: string, relative = ""): Promise<string[]> {
	const entries = await readdir(path.join(root, relative), {
		withFileTypes: true,
	});
	const files: string[] = [];
	for (const entry of entries) {
		const entryPath = relative ? `${relative}/${entry.name}` : entry.name;
		if (entry.isDirectory()) files.push(...(await listFiles(root, entryPath)));
		else if (entry.isFile()) files.push(entryPath);
		else throw new ExtensionIntegrityError(`${entryPath} is not a plain file`);
	}
	return files;
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

function isMissing(error: unknown): boolean {
	return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}
