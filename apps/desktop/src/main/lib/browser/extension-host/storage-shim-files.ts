import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { shimChromeStorage } from "shared/browser-extension-storage-shim";
import { isUserExtension } from "./user-extensions";

export const STORAGE_SHIM_SCRIPT = "superset-storage-shim.js";
const SHIM_TAG = `<script src="/${STORAGE_SHIM_SCRIPT}"></script>`;

interface ContentScript {
	js?: string[];
	world?: string;
}

/** The exact bytes of the shim file the app writes into an extension. */
export function storageShimSource(): Buffer {
	return Buffer.from(`(${shimChromeStorage})(false);\n`);
}

export function isExtensionPage(file: string): boolean {
	return /\.html?$/i.test(file);
}

/**
 * The manifest with the shim first in each content script that runs beside
 * the extension's own world. Unchanged text when there is nothing to add.
 */
export function shimManifestText(text: string): string {
	const manifest: { content_scripts?: ContentScript[] } = JSON.parse(
		text.replace(/^\uFEFF/, ""),
	);
	const unshimmed = (manifest.content_scripts ?? []).filter(
		(script) =>
			script.world !== "MAIN" &&
			script.js?.length &&
			script.js[0] !== STORAGE_SHIM_SCRIPT,
	);
	if (unshimmed.length === 0) return text;
	for (const script of unshimmed) {
		script.js = [STORAGE_SHIM_SCRIPT, ...(script.js ?? [])];
	}
	return JSON.stringify(manifest, null, 2);
}

// latin1 maps each byte to one character, so offsets are byte offsets and
// pages in any encoding come back byte for byte.
function tagOffset(html: string): number {
	const opening =
		/<head\b[^>]*>/i.exec(html) ??
		/<html\b[^>]*>/i.exec(html) ??
		/<!doctype[^>]*>/i.exec(html);
	return opening ? opening.index + opening[0].length : 0;
}

/** The page with the shim tag added, or null when it already has it. */
export function shimPage(page: Buffer): Buffer | null {
	const html = page.toString("latin1");
	if (html.includes(SHIM_TAG)) return null;
	const at = tagOffset(html);
	return Buffer.from(html.slice(0, at) + SHIM_TAG + html.slice(at), "latin1");
}

/**
 * The page as it was before `shimPage`. A tag anywhere else than where
 * `shimPage` puts it stays, so the page no longer matches its hash.
 */
export function unshimPage(page: Buffer): Buffer {
	const html = page.toString("latin1");
	const at = html.indexOf(SHIM_TAG);
	if (at < 0) return page;
	const original = Buffer.from(
		html.slice(0, at) + html.slice(at + SHIM_TAG.length),
		"latin1",
	);
	return shimPage(original)?.equals(page) ? original : page;
}

/** Puts the app's own shim back over an older or changed copy, before the files are checked. */
export async function refreshStorageShimScript(
	extensionPath: string,
): Promise<void> {
	const file = path.join(extensionPath, STORAGE_SHIM_SCRIPT);
	try {
		await readFile(file);
	} catch {
		return;
	}
	await writeFile(file, storageShimSource());
}

/**
 * Content scripts, and extension pages in a website's iframe, run where no
 * session preload reaches. The storage shim goes into the extension's folder
 * as the first script of each content script and page. The integrity check
 * knows these exact changes and undoes them before it compares hashes.
 */
export async function addStorageShimFiles(
	extensionPath: string,
): Promise<void> {
	await writeFile(
		path.join(extensionPath, STORAGE_SHIM_SCRIPT),
		storageShimSource(),
	);
	const manifestPath = path.join(extensionPath, "manifest.json");
	const manifest = await readFile(manifestPath, "utf8");
	const shimmed = shimManifestText(manifest);
	if (shimmed !== manifest) await writeFile(manifestPath, shimmed);

	const entries = await readdir(extensionPath, {
		recursive: true,
		withFileTypes: true,
	});
	for (const entry of entries) {
		if (!entry.isFile() || !isExtensionPage(entry.name)) continue;
		const pagePath = path.join(entry.parentPath, entry.name);
		const page = shimPage(await readFile(pagePath));
		if (page) await writeFile(pagePath, page);
	}
}

/** Every load of a Web Store extension, at start, install or update, adds the shim first. */
export function shimStorageOnLoad(
	browserSession: Electron.Session,
	installRoot: string,
): void {
	const extensions = browserSession.extensions;
	const load = extensions.loadExtension.bind(extensions);
	extensions.loadExtension = async (extensionPath, options) => {
		if (isUserExtension({ path: extensionPath }, installRoot)) {
			await addStorageShimFiles(extensionPath).catch((error: unknown) => {
				console.error(
					`[extension-host] No storage.sync shim in ${extensionPath}:`,
					error,
				);
			});
		}
		return load(extensionPath, options);
	};
}
