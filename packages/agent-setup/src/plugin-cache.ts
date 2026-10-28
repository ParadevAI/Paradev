import fs from "node:fs";
import path from "node:path";
import { resolveSupersetHomeDir } from "./paths";

const SAFE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._+-]*$/;

/** One path segment of the plugin cache: no traversal, no separators. */
export function isSafePluginSegment(value: string): boolean {
	return (
		typeof value === "string" &&
		SAFE_SEGMENT.test(value) &&
		!value.includes("..")
	);
}

export function assertSafePluginSegment(value: string, label: string): string {
	if (!isSafePluginSegment(value)) {
		throw new Error(
			`Refusing to use ${label} "${value}": it must be alphanumeric with dots, dashes, pluses, or underscores, and cannot contain "..".`,
		);
	}
	return value;
}

export function pluginCacheDir(): string {
	return path.join(resolveSupersetHomeDir(), "plugins", "cache");
}

/**
 * Where an installed plugin's tree lives, on a laptop and in a box alike. The
 * version is in the path, so a tree either exists at its version or does not.
 */
export function pluginCachePath(
	marketplace: string,
	name: string,
	version: string,
): string {
	return path.join(
		pluginCacheDir(),
		assertSafePluginSegment(marketplace, "marketplace"),
		assertSafePluginSegment(name, "plugin name"),
		assertSafePluginSegment(version, "version"),
	);
}

/**
 * Writes an unpacked plugin tree to its cache path. Staged and renamed into
 * place, so a process stopped mid-write leaves no tree that looks installed.
 */
export function writePluginTree(
	marketplace: string,
	name: string,
	version: string,
	files: ReadonlyMap<string, Uint8Array>,
	executable: ReadonlySet<string> = new Set(),
): string {
	const target = path.resolve(pluginCachePath(marketplace, name, version));
	const staging = `${target}.incoming-${process.pid}`;
	const previous = `${target}.previous-${process.pid}`;
	fs.rmSync(staging, { recursive: true, force: true });
	try {
		for (const [relative, data] of files) {
			const destination = path.resolve(staging, relative);
			if (!destination.startsWith(`${staging}${path.sep}`)) {
				throw new Error(
					`Refusing to write "${relative}": it escapes the plugin.`,
				);
			}
			fs.mkdirSync(path.dirname(destination), { recursive: true });
			fs.writeFileSync(destination, data, {
				mode: executable.has(relative) ? 0o755 : 0o644,
			});
		}
		fs.rmSync(previous, { recursive: true, force: true });
		const hadTarget = fs.existsSync(target);
		if (hadTarget) fs.renameSync(target, previous);
		try {
			fs.renameSync(staging, target);
		} catch (error) {
			if (hadTarget) fs.renameSync(previous, target);
			throw error;
		}
		fs.rmSync(previous, { recursive: true, force: true });
	} catch (error) {
		fs.rmSync(staging, { recursive: true, force: true });
		throw error;
	}
	return target;
}
