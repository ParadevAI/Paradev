import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

export const PLUGIN_BUNDLE_MAX_BYTES = 2 * 1024 * 1024;
const PLUGIN_BUNDLE_MAX_UNPACKED_BYTES = 16 * 1024 * 1024;
const PLUGIN_BUNDLE_MAX_FILES = 500;
const PLUGIN_BUNDLE_FORMAT = 2;
const READABLE_FORMATS = new Set([1, 2]);

/** Top-level folders a plugin bundle leaves out. Hooks are not run, so they are not carried. */
export const PLUGIN_TREE_EXCLUDED = [".git", "node_modules", "hooks"] as const;

const EXCLUDED_FILES = new Set([".DS_Store"]);

export interface PluginTree {
	files: Map<string, Buffer>;
	executable: Set<string>;
}

/** Whether a file at this path inside a plugin directory goes into its bundle. */
export function isPluginTreePath(path: string): boolean {
	const segments = path.split("/");
	return (
		Boolean(path) &&
		!(PLUGIN_TREE_EXCLUDED as readonly string[]).includes(segments[0] ?? "") &&
		!EXCLUDED_FILES.has(segments[segments.length - 1] ?? "")
	);
}

export class PluginBundleError extends Error {}

export function pluginBundleHash(bundle: Uint8Array): string {
	return createHash("sha256").update(bundle).digest("hex");
}

function assertTreePath(path: string): void {
	const segments = path.split("/");
	if (
		!isPluginTreePath(path) ||
		path.includes("\\") ||
		path.includes("\0") ||
		segments.some((s) => !s || s === "." || s === "..")
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
