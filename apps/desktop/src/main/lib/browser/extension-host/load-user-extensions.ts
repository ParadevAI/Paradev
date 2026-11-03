import { existsSync } from "node:fs";
import {
	mkdir,
	readdir,
	readFile,
	rename,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
	ExtensionIntegrityError,
	verifyExtensionFiles,
} from "./extension-integrity";

export interface TurnedOffExtension {
	id: string;
	name: string;
	version: string;
}

export interface UserExtensionPaths {
	/** `<id>/<version>_0` folders the app loads. */
	extensionsPath: string;
	/** Original manifests saved at install, `<id>/<version>.json`. */
	manifestsPath: string;
	/** Extensions whose files changed, moved out so nothing loads them. */
	turnedOffPath: string;
}

const EXTENSION_ID = /^[a-p]{32}$/;
const VERSION_DIR = /^(\d+(?:\.\d+){0,3})_\d+$/;
// Present once every install made before manifests were saved has been trusted once.
const EXISTING_INSTALLS_TRUSTED = ".existing-installs-trusted";

/**
 * Loads each installed extension once its files match what the Web Store
 * signed. One whose files changed is moved to `turnedOffPath` and returned.
 */
export async function loadUserExtensions(
	session: Pick<Electron.Session, "extensions" | "serviceWorkers">,
	paths: UserExtensionPaths,
	localizedName: (
		dir: string,
		manifest: chrome.runtime.Manifest,
	) => Promise<string>,
): Promise<TurnedOffExtension[]> {
	const trustUnsavedManifest = !existsSync(
		path.join(paths.manifestsPath, EXISTING_INSTALLS_TRUSTED),
	);
	const loadedVersions = new Map<string, string>();
	let everyInstallChecked = true;
	const loadOne = async (id: string) => {
		let dir: string | null = null;
		try {
			dir = await latestVersionDir(path.join(paths.extensionsPath, id));
			if (!dir) return;
			const { version } = await verifyExtensionFiles(dir, {
				extensionId: id,
				manifestsPath: paths.manifestsPath,
				trustUnsavedManifest,
			});
			loadedVersions.set(id, version);
		} catch (error) {
			if (!(error instanceof ExtensionIntegrityError)) {
				everyInstallChecked = false;
				console.error(`[extension-host] Failed to check ${id}:`, error);
				return;
			}
			console.error(`[extension-host] ${id} is turned off: ${error.message}`);
			await turnOff(paths, id).catch((moveError: unknown) => {
				console.error(`[extension-host] Failed to move ${id}:`, moveError);
			});
			return;
		}
		await loadAndStart(session, dir).catch((error: unknown) => {
			console.error(`[extension-host] Failed to load ${id}:`, error);
		});
	};
	await Promise.all((await extensionIds(paths.extensionsPath)).map(loadOne));
	await pruneManifests(paths, loadedVersions);
	if (everyInstallChecked) {
		await mkdir(paths.manifestsPath, { recursive: true });
		await writeFile(
			path.join(paths.manifestsPath, EXISTING_INSTALLS_TRUSTED),
			"",
		);
	}
	return listTurnedOffExtensions(paths.turnedOffPath, localizedName);
}

async function turnOff(paths: UserExtensionPaths, id: string): Promise<void> {
	await mkdir(paths.turnedOffPath, { recursive: true });
	await rm(path.join(paths.turnedOffPath, id), {
		recursive: true,
		force: true,
	});
	await rename(
		path.join(paths.extensionsPath, id),
		path.join(paths.turnedOffPath, id),
	);
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
		const dir = await latestVersionDir(path.join(turnedOffPath, id));
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

/** Keeps the saved manifest only for the version each installed extension loads. */
async function pruneManifests(
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

async function latestVersionDir(extensionDir: string): Promise<string | null> {
	let latest: { name: string; version: number[] } | null = null;
	for (const name of await readdir(extensionDir)) {
		const match = VERSION_DIR.exec(name)?.[1];
		if (!match) continue;
		const version = match.split(".").map(Number);
		if (!latest || compareVersions(version, latest.version) > 0) {
			latest = { name, version };
		}
	}
	return latest ? path.join(extensionDir, latest.name) : null;
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
		return JSON.parse(await readFile(path.join(dir, "manifest.json"), "utf8"));
	} catch {
		return null;
	}
}
