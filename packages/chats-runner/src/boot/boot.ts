import { createHash } from "node:crypto";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";

/**
 * The runner bundle (runner.js, its worker and wasm, pi's package.json, the CLI) is content-addressed: `manifest.json`
 * maps each file's name to its sha256, and the manifest's own sha256 is the bundle's id. The API is built with one
 * bundle and passes its id to every box it wakes (`DEV_RUNNER_SHA`); the image carries one too, as the fallback.
 * The boot runs whichever the API asked for, downloaded once per Dev into its folder and checked on every start,
 * so a runner or CLI change ships with the API, without a new image.
 */
export const MANIFEST = "manifest.json";

export const sha256 = (bytes: Uint8Array) =>
	createHash("sha256").update(bytes).digest("hex");

const SHA = /^[0-9a-f]{64}$/;
/** Plain names in one folder: a manifest can't point a write anywhere else. */
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

interface Manifest {
	files: Record<string, string>;
}

/** The manifest for these files (sorted, so the same files always make the same id) and the bundle's id. */
export function bundleManifest(files: Record<string, Uint8Array>): {
	bytes: Uint8Array;
	sha: string;
} {
	const sorted = Object.fromEntries(
		Object.keys(files)
			.sort()
			.map((name) => [name, sha256(files[name]!)]),
	);
	const bytes = new TextEncoder().encode(
		`${JSON.stringify({ files: sorted } satisfies Manifest, null, 2)}\n`,
	);
	return { bytes, sha: sha256(bytes) };
}

function parseManifest(bytes: Uint8Array): Manifest {
	const parsed = JSON.parse(
		new TextDecoder().decode(bytes),
	) as Partial<Manifest>;
	const files = parsed.files;
	if (!files || typeof files !== "object")
		throw new Error("the manifest lists no files");
	for (const [name, sha] of Object.entries(files)) {
		if (
			!FILE_NAME.test(name) ||
			name === MANIFEST ||
			typeof sha !== "string" ||
			!SHA.test(sha)
		)
			throw new Error(`bad manifest entry ${name}`);
	}
	if (!files["runner.js"] || !files["cli.js"])
		throw new Error("the manifest has no runner.js or cli.js");
	return { files };
}

/** The bundle's id when `dir` holds a complete, intact bundle; else null. */
export async function verifiedBundle(dir: string): Promise<string | null> {
	try {
		const bytes = await readFile(join(dir, MANIFEST));
		const { files } = parseManifest(bytes);
		for (const [name, sha] of Object.entries(files))
			if (sha256(await readFile(join(dir, name))) !== sha) return null;
		return sha256(bytes);
	} catch {
		return null;
	}
}

export interface ResolveInput {
	/** The image's bundle (`/opt/dev`), trusted as it is. */
	builtinDir: string;
	/** The bundle the API asked for; unset: the image's. */
	want?: string;
	/** Where downloaded bundles are kept, one folder per id (in the Dev's folder, so they outlive the box). */
	cacheDir: string;
	/** The API as the box reaches it: `GET <apiUrl>/box-artifacts/<sha>` answers a manifest or a file by its sha256. */
	apiUrl: string;
	fetch?: typeof fetch;
	/** Per request; a slow API falls back to the image's bundle rather than holding up the wake. */
	timeoutMs?: number;
	log?: (line: string) => void;
}

export interface Resolved {
	dir: string;
	sha: string;
	source: "image" | "cache" | "download";
	/** Why the image's bundle runs although another was asked for. */
	fallback?: string;
}

async function download(input: ResolveInput, sha: string): Promise<Uint8Array> {
	const res = await (input.fetch ?? fetch)(
		`${input.apiUrl.replace(/\/$/, "")}/box-artifacts/${sha}`,
		{ signal: AbortSignal.timeout(input.timeoutMs ?? 30_000) },
	);
	if (!res.ok)
		throw new Error(
			`GET /box-artifacts/${sha.slice(0, 12)} answered ${res.status}`,
		);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (sha256(bytes) !== sha)
		throw new Error(
			`/box-artifacts/${sha.slice(0, 12)} doesn't match its sha256`,
		);
	return bytes;
}

/**
 * Fetches bundle `want` into `cacheDir/<want>`: files the image's bundle already has (same name and sha256) are copied
 * from it, the rest downloaded and checked. Written to a temporary folder and renamed into place, so a box that dies
 * halfway leaves nothing that looks complete; other bundles in the cache go once this one is in place.
 */
async function fetchBundle(
	input: ResolveInput,
	want: string,
	builtin: Manifest | null,
): Promise<string> {
	const manifestBytes = await download(input, want);
	const { files } = parseManifest(manifestBytes);
	const target = join(input.cacheDir, want);
	const tmp = join(
		input.cacheDir,
		`.tmp-${want.slice(0, 12)}-${process.pid}-${Date.now()}`,
	);
	await mkdir(tmp, { recursive: true });
	try {
		for (const [name, sha] of Object.entries(files)) {
			const local =
				builtin?.files[name] === sha
					? await readFile(join(input.builtinDir, name)).catch(() => null)
					: null;
			await writeFile(
				join(tmp, name),
				local && sha256(local) === sha ? local : await download(input, sha),
			);
		}
		await writeFile(join(tmp, MANIFEST), manifestBytes);
		await rm(target, { recursive: true, force: true });
		await rename(tmp, target);
	} catch (err) {
		await rm(tmp, { recursive: true, force: true });
		throw err;
	}
	for (const entry of await readdir(input.cacheDir))
		if (entry !== want)
			await rm(join(input.cacheDir, entry), { recursive: true, force: true });
	return target;
}

/** Which bundle to run: the one asked for (from the cache, else downloaded), or the image's when none was or that fails. */
export async function resolveBundle(input: ResolveInput): Promise<Resolved> {
	const log = input.log ?? (() => {});
	const builtinBytes = await readFile(join(input.builtinDir, MANIFEST)).catch(
		() => null,
	);
	const builtinSha = builtinBytes ? sha256(builtinBytes) : "unknown";
	const image: Resolved = {
		dir: input.builtinDir,
		sha: builtinSha,
		source: "image",
	};
	const want = input.want?.trim();
	if (!want || want === builtinSha) return image;
	if (!SHA.test(want))
		return { ...image, fallback: `DEV_RUNNER_SHA isn't a sha256` };
	const cached = join(input.cacheDir, want);
	if ((await verifiedBundle(cached)) === want)
		return { dir: cached, sha: want, source: "cache" };
	try {
		log(
			`fetching runner bundle ${want.slice(0, 12)} (the image has ${builtinSha.slice(0, 12)})`,
		);
		const builtin = builtinBytes ? parseManifest(builtinBytes) : null;
		const dir = await fetchBundle(input, want, builtin);
		if ((await verifiedBundle(dir)) !== want)
			throw new Error("the downloaded bundle doesn't verify");
		return { dir, sha: want, source: "download" };
	} catch (err) {
		return {
			...image,
			fallback: err instanceof Error ? err.message : String(err),
		};
	}
}
