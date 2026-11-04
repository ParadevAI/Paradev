import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { NATIVE_MESSAGING_ERRORS } from "shared/browser-extension-native-messaging";

export interface NativeHost {
	name: string;
	/** Absolute path of the host executable. */
	path: string;
	allowedOrigins: string[];
}

export type NativeHostLookup =
	| { ok: true; host: NativeHost }
	| { ok: false; error: string };

export interface HostLocations {
	platform: NodeJS.Platform;
	home: string;
	/** This app's own user-level directory, so a host can target only this app. */
	appHostsDir: string;
}

const EXTENSION_ID = /^[a-p]{32}$/;

/** Chrome's rule: dot-separated parts of lowercase letters, digits and `_`. */
export function isValidNativeHostName(name: unknown): name is string {
	return typeof name === "string" && /^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(name);
}

export function extensionOrigin(extensionId: string): string {
	return `chrome-extension://${extensionId}/`;
}

/** Manifest directories in Chrome's order: system-level, then user-level. */
export function nativeHostDirectories({
	platform,
	home,
	appHostsDir,
}: HostLocations): string[] {
	if (platform === "darwin") {
		const support = path.join(home, "Library/Application Support");
		return [
			"/Library/Google/Chrome/NativeMessagingHosts",
			"/Library/Application Support/Chromium/NativeMessagingHosts",
			appHostsDir,
			path.join(support, "Google/Chrome/NativeMessagingHosts"),
			path.join(support, "Chromium/NativeMessagingHosts"),
		];
	}
	if (platform === "linux") {
		return [
			"/etc/opt/chrome/native-messaging-hosts",
			"/etc/chromium/native-messaging-hosts",
			appHostsDir,
			path.join(home, ".config/google-chrome/NativeMessagingHosts"),
			path.join(home, ".config/chromium/NativeMessagingHosts"),
		];
	}
	return [];
}

/**
 * Registry keys whose default value is a manifest path, in Chrome's order:
 * per root, the 32-bit view and then the 64-bit one.
 */
export function windowsHostRegistryKeys(name: string): [string, string][] {
	return ["HKCU", "HKLM"].flatMap((root) =>
		["/reg:32", "/reg:64"].flatMap((view) =>
			["Google\\Chrome", "Chromium"].map((browser): [string, string] => [
				`${root}\\Software\\${browser}\\NativeMessagingHosts\\${name}`,
				view,
			]),
		),
	);
}

/** The default value in `reg query /ve` output, with REG_EXPAND_SZ expanded. */
export function parseRegistryDefault(
	stdout: string,
	env: NodeJS.ProcessEnv = process.env,
): string | null {
	const match = /REG_(EXPAND_)?SZ\s+(.+)\r?$/m.exec(stdout);
	const value = match?.[2]?.trim();
	if (!value) return null;
	if (!match?.[1]) return value;
	return value.replace(
		/%([^%]+)%/g,
		(reference, variable: string) => env[variable] ?? reference,
	);
}

function queryRegistryDefault([key, view]: [string, string]): Promise<
	string | null
> {
	return new Promise((resolve) => {
		execFile("reg", ["query", key, "/ve", view], (error, stdout) => {
			if (!error) return resolve(parseRegistryDefault(stdout));
			// reg exits with 1 when the key or value does not exist.
			if (error.code !== 1) {
				console.warn(`[native-messaging] Cannot query ${key} ${view}:`, error);
			}
			resolve(null);
		});
	});
}

/**
 * Validates a manifest as Chrome does. `allowed_origins` entries must name one
 * extension; Chrome rejects wildcards.
 */
export function parseNativeHostManifest(
	raw: string,
	name: string,
	manifestPath: string,
	platform: NodeJS.Platform,
): NativeHost {
	const manifest = JSON.parse(raw) as Record<string, unknown>;
	if (manifest.name !== name) {
		throw new Error(`The manifest's name is not ${name}.`);
	}
	if (typeof manifest.description !== "string") {
		throw new Error("The manifest has no description.");
	}
	if (manifest.type !== "stdio") {
		throw new Error('The manifest\'s type must be "stdio".');
	}
	if (typeof manifest.path !== "string" || manifest.path === "") {
		throw new Error("The manifest has no path.");
	}
	let hostPath = manifest.path;
	if (!path.isAbsolute(hostPath)) {
		if (platform !== "win32") {
			throw new Error("The manifest's path must be absolute.");
		}
		hostPath = path.resolve(path.dirname(manifestPath), hostPath);
	}
	const origins = manifest.allowed_origins;
	if (!Array.isArray(origins)) {
		throw new Error("The manifest has no allowed_origins.");
	}
	const allowedOrigins = origins.map((origin) => {
		const extensionId =
			typeof origin === "string"
				? /^chrome-extension:\/\/([^/]+)\/\*?$/.exec(origin)?.[1]
				: undefined;
		if (!extensionId || !EXTENSION_ID.test(extensionId)) {
			throw new Error(`allowed_origins has an invalid entry: ${origin}`);
		}
		return extensionOrigin(extensionId);
	});
	return { name, path: hostPath, allowedOrigins };
}

async function manifestPaths(
	name: string,
	locations: HostLocations,
): Promise<string[]> {
	if (locations.platform !== "win32") {
		return nativeHostDirectories(locations).map((dir) =>
			path.join(dir, `${name}.json`),
		);
	}
	const fromRegistry = await Promise.all(
		windowsHostRegistryKeys(name).map(queryRegistryDefault),
	);
	return [
		path.join(locations.appHostsDir, `${name}.json`),
		...fromRegistry.filter((value): value is string => value !== null),
	];
}

/**
 * Finds the host `name` for `extensionId`. The first manifest that exists
 * wins, as in Chrome; an invalid or unreadable one stops the lookup.
 */
export async function findNativeHost(
	name: unknown,
	extensionId: string,
	locations: HostLocations,
): Promise<NativeHostLookup> {
	if (!isValidNativeHostName(name)) {
		return { ok: false, error: NATIVE_MESSAGING_ERRORS.invalidName };
	}
	for (const manifestPath of await manifestPaths(name, locations)) {
		let raw: string;
		try {
			raw = await readFile(manifestPath, "utf8");
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code === "ENOENT" || code === "ENOTDIR") continue;
			console.warn(`[native-messaging] Cannot read ${manifestPath}:`, error);
			return { ok: false, error: NATIVE_MESSAGING_ERRORS.notFound };
		}
		let host: NativeHost;
		try {
			host = parseNativeHostManifest(
				raw,
				name,
				manifestPath,
				locations.platform,
			);
			await access(host.path);
		} catch (error) {
			console.warn(
				`[native-messaging] Ignoring ${manifestPath}:`,
				error instanceof Error ? error.message : error,
			);
			return { ok: false, error: NATIVE_MESSAGING_ERRORS.notFound };
		}
		if (!host.allowedOrigins.includes(extensionOrigin(extensionId))) {
			return { ok: false, error: NATIVE_MESSAGING_ERRORS.forbidden };
		}
		return { ok: true, host };
	}
	return { ok: false, error: NATIVE_MESSAGING_ERRORS.notFound };
}
