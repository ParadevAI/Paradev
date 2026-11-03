import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import {
	checkExtensionFiles,
	ExtensionIntegrityError,
} from "./extension-integrity";
import { refreshStorageShimScript } from "./storage-shim-files";

export interface TurnedOffExtension {
	id: string;
	name: string;
	version: string;
}

export interface UserExtensionPaths {
	/** `<id>/<version>_0` folders the app loads. */
	extensionsPath: string;
	/** Records of each version's files, `<id>/<version>.json`. */
	manifestsPath: string;
	/** Extensions whose files changed, moved out so nothing loads them. */
	turnedOffPath: string;
}

const EXTENSION_ID = /^[a-p]{32}$/;
const VERSION_DIR = /^(\d+(?:\.\d+){0,3})_\d+$/;

/**
 * Loads each installed extension after checking its files against its record.
 * Only a file that differs from the record keeps an extension from loading: it
 * is moved to `turnedOffPath` and returned. An extension with no usable record,
 * or one that cannot be read, loads.
 */
export async function loadUserExtensions(
	session: Pick<Electron.Session, "extensions" | "serviceWorkers">,
	paths: UserExtensionPaths,
	localizedName: (
		dir: string,
		manifest: chrome.runtime.Manifest,
	) => Promise<string>,
): Promise<TurnedOffExtension[]> {
	const loadedVersions = new Map<string, string>();
	const loadOne = async (id: string) => {
		let installed: { dir: string; version: string } | null;
		try {
			installed = await latestVersion(path.join(paths.extensionsPath, id));
		} catch (error) {
			console.error(`[extension-host] Failed to read ${id}:`, error);
			return;
		}
		if (!installed) return;
		await refreshStorageShimScript(installed.dir).catch((error: unknown) => {
			console.error(`[extension-host] Failed to refresh ${id}'s shim:`, error);
		});
		try {
			const result = await checkExtensionFiles(installed.dir, {
				extensionId: id,
				version: installed.version,
				manifestsPath: paths.manifestsPath,
			});
			if (result === "recorded") {
				console.log(
					`[extension-host] ${id}@${installed.version} has no signed record; its files are trusted from now on`,
				);
			}
		} catch (error) {
			if (error instanceof ExtensionIntegrityError) {
				console.error(`[extension-host] ${id} is turned off: ${error.message}`);
				await turnOff(paths, id).catch((moveError: unknown) => {
					console.error(`[extension-host] Failed to move ${id}:`, moveError);
				});
				return;
			}
			console.error(
				`[extension-host] Could not check ${id}; loading it unchecked:`,
				error,
			);
		}
		loadedVersions.set(id, installed.version);
		await loadAndStart(session, installed.dir).catch((error: unknown) => {
			console.error(`[extension-host] Failed to load ${id}:`, error);
		});
	};
	await Promise.all((await extensionIds(paths.extensionsPath)).map(loadOne));
	await pruneRecords(paths, loadedVersions).catch((error: unknown) => {
		console.error("[extension-host] Failed to prune records:", error);
	});
	return listTurnedOffExtensions(paths.turnedOffPath, localizedName);
}

async function turnOff(paths: UserExtensionPaths, id: string): Promise<void> {
	await mkdir(paths.turnedOffPath, { recursive: true });
	const target = path.join(paths.turnedOffPath, id);
	const previous = `${target}.previous`;
	await rm(previous, { recursive: true, force: true });
	const hadPrevious = await rename(target, previous).then(
		() => true,
		(error: NodeJS.ErrnoException) => {
			if (error.code === "ENOENT") return false;
			throw error;
		},
	);
	try {
		await rename(path.join(paths.extensionsPath, id), target);
	} catch (error) {
		if (hadPrevious) {
			await rename(previous, target).catch((restoreError: unknown) => {
				console.error(
					`[extension-host] Failed to restore ${id}:`,
					restoreError,
				);
			});
		}
		throw error;
	}
	await rm(previous, { recursive: true, force: true });
}

async function listTurnedOffExtensions(
	turnedOffPath: string,
	localizedName: (
		dir: string,
		manifest: chrome.runtime.Manifest,
	) => Promise<string>,
): Promise<TurnedOffExtension[]> {
	const turnedOff: TurnedOffExtension[] = [];
	for (const id of await extensionIds(turnedOffPath)) {
		const dir = await latestVersion(path.join(turnedOffPath, id)).then(
			(found) => found?.dir,
			(error: unknown) => {
				console.error(`[extension-host] Failed to read ${id}:`, error);
				return undefined;
			},
		);
		const manifest = dir ? await readManifest(dir) : null;
		turnedOff.push({
			id,
			name: dir && manifest ? await localizedName(dir, manifest) : id,
			version: manifest?.version ?? "",
		});
	}
	return turnedOff;
}

async function loadAndStart(
	session: Pick<Electron.Session, "extensions" | "serviceWorkers">,
	dir: string,
): Promise<void> {
	const extension = await session.extensions.loadExtension(dir);
	const { manifest } = extension;
	if (manifest.manifest_version === 3 && manifest.background?.service_worker) {
		await session.serviceWorkers
			.startWorkerForScope(`chrome-extension://${extension.id}`)
			.catch(() => {
				console.error(
					`[extension-host] Failed to start the worker for ${extension.id}`,
				);
			});
	}
}

/** Keeps the record only for the version each installed extension loads. */
async function pruneRecords(
	paths: UserExtensionPaths,
	loadedVersions: Map<string, string>,
): Promise<void> {
	const installed = new Set(await extensionIds(paths.extensionsPath));
	for (const id of await extensionIds(paths.manifestsPath)) {
		const dir = path.join(paths.manifestsPath, id);
		if (!installed.has(id)) {
			await rm(dir, { recursive: true, force: true });
			continue;
		}
		const keep = loadedVersions.get(id);
		if (!keep) continue;
		for (const file of await readdir(dir)) {
			if (file !== `${keep}.json`)
				await rm(path.join(dir, file), { force: true });
		}
	}
}

async function extensionIds(root: string): Promise<string[]> {
	try {
		const entries = await readdir(root, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isDirectory() && EXTENSION_ID.test(entry.name))
			.map((entry) => entry.name);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

async function latestVersion(
	extensionDir: string,
): Promise<{ dir: string; version: string } | null> {
	let latest: { name: string; version: string; parts: number[] } | null = null;
	for (const entry of await readdir(extensionDir, { withFileTypes: true })) {
		const { name } = entry;
		const version = entry.isDirectory() ? VERSION_DIR.exec(name)?.[1] : null;
		if (!version) continue;
		const parts = version.split(".").map(Number);
		if (!latest || compareVersions(parts, latest.parts) > 0) {
			latest = { name, version, parts };
		}
	}
	return latest
		? { dir: path.join(extensionDir, latest.name), version: latest.version }
		: null;
}

function compareVersions(a: number[], b: number[]): number {
	for (let index = 0; index < Math.max(a.length, b.length); index++) {
		const difference = (a[index] ?? 0) - (b[index] ?? 0);
		if (difference !== 0) return difference;
	}
	return 0;
}

async function readManifest(
	dir: string,
): Promise<chrome.runtime.Manifest | null> {
	try {
		const manifest: unknown = JSON.parse(
			await readFile(path.join(dir, "manifest.json"), "utf8"),
		);
		const { name, version } = (manifest ?? {}) as Record<string, unknown>;
		return typeof name === "string" && typeof version === "string"
			? (manifest as chrome.runtime.Manifest)
			: null;
	} catch {
		return null;
	}
}
