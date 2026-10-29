import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export const PLUGIN_BUNDLE_MAX_BYTES = 2 * 1024 * 1024;
export const PLUGIN_BUNDLE_MAX_UNPACKED_BYTES = 16 * 1024 * 1024;
export const PLUGIN_BUNDLE_MAX_FILES = 500;
export const PLUGIN_BUNDLE_FORMAT = 2;
const READABLE_FORMATS = new Set([1, 2]);

const EXCLUDED_DIRS = new Set([".git", "node_modules"]);
const EXCLUDED_TOP_LEVEL = new Set(["hooks"]);
const EXCLUDED_FILES = new Set([".DS_Store"]);

export interface PluginTree {
	files: Map<string, Buffer>;
	executable: Set<string>;
}

export function isPluginTreePath(path: string): boolean {
	const segments = path.split("/");
	return (
		Boolean(path) &&
		!EXCLUDED_TOP_LEVEL.has(segments[0] ?? "") &&
		!segments.slice(0, -1).some((segment) => EXCLUDED_DIRS.has(segment)) &&
		!EXCLUDED_FILES.has(segments[segments.length - 1] ?? "")
	);
}

export class PluginBundleError extends Error {}

export function pluginBundleHash(bundle: Uint8Array): string {
	return createHash("sha256").update(bundle).digest("hex");
}

/** A hash of the files themselves, which stays the same when only the packing changes. */
export function pluginTreeHash(tree: {
	files: ReadonlyMap<string, Uint8Array>;
	executable: ReadonlySet<string>;
}): string {
	const hash = createHash("sha256");
	for (const path of [...tree.files.keys()].sort()) {
		const data = tree.files.get(path) as Uint8Array;
		hash.update(
			`${path}\0${tree.executable.has(path) ? 1 : 0}\0${data.length}\0`,
		);
		hash.update(data);
	}
	return hash.digest("hex");
}

function assertTreePath(path: string): void {
	const segments = path.split("/");
	if (
		!isPluginTreePath(path) ||
		path.includes("\\") ||
		path.includes("\0") ||
		segments.some((s) => !s || s === "." || s === "..") ||
		(segments[0] === "plugin.json" && segments.length > 1)
	) {
		throw new PluginBundleError(`"${path}" is not a path a plugin may carry`);
	}
}

export function packPluginBundle(
	files: ReadonlyMap<string, Uint8Array>,
	executable: ReadonlySet<string> = new Set(),
): Buffer {
	const entries = [...files.entries()]
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
		.map(([path, data]) => {
			assertTreePath(path);
			return {
				path,
				content: Buffer.from(data).toString("base64"),
				...(executable.has(path) ? { executable: true } : {}),
			};
		});
	const bundle = gzipSync(
		JSON.stringify({ format: PLUGIN_BUNDLE_FORMAT, files: entries }),
	);
	if (bundle.length > PLUGIN_BUNDLE_MAX_BYTES) {
		throw new PluginBundleError(
			`the plugin is ${bundle.length} bytes packed, over the ${PLUGIN_BUNDLE_MAX_BYTES} byte limit`,
		);
	}
	return bundle;
}

export function unpackPluginBundle(bundle: Uint8Array): PluginTree {
	if (bundle.length > PLUGIN_BUNDLE_MAX_BYTES) {
		throw new PluginBundleError(
			`the plugin is over the ${PLUGIN_BUNDLE_MAX_BYTES} byte limit`,
		);
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(
			gunzipSync(bundle, {
				maxOutputLength: PLUGIN_BUNDLE_MAX_UNPACKED_BYTES,
			}).toString("utf8"),
		);
	} catch {
		throw new PluginBundleError("the upload is not a plugin bundle");
	}

	const { format, files } = (parsed ?? {}) as {
		format?: unknown;
		files?: unknown;
	};
	if (
		typeof format !== "number" ||
		!READABLE_FORMATS.has(format) ||
		!Array.isArray(files)
	) {
		throw new PluginBundleError("the upload is not a plugin bundle");
	}
	if (files.length > PLUGIN_BUNDLE_MAX_FILES) {
		throw new PluginBundleError(
			`the plugin has ${files.length} files, over the limit of ${PLUGIN_BUNDLE_MAX_FILES}`,
		);
	}

	const out = new Map<string, Buffer>();
	const executable = new Set<string>();
	for (const file of files as {
		path?: unknown;
		content?: unknown;
		executable?: unknown;
	}[]) {
		if (typeof file?.path !== "string" || typeof file.content !== "string") {
			throw new PluginBundleError("the upload is not a plugin bundle");
		}
		assertTreePath(file.path);
		if (out.has(file.path)) {
			throw new PluginBundleError(`"${file.path}" appears twice`);
		}
		out.set(file.path, Buffer.from(file.content, "base64"));
		if (file.executable === true) executable.add(file.path);
	}
	if (!out.has("plugin.json")) {
		throw new PluginBundleError("it has no plugin.json at its root");
	}
	return { files: out, executable };
}
