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

function withShimTag(html: string): string | null {
	if (html.includes(SHIM_TAG)) return null;
	const opening =
		/<head\b[^>]*>/i.exec(html) ??
		/<html\b[^>]*>/i.exec(html) ??
		/<!doctype[^>]*>/i.exec(html);
	const at = opening ? opening.index + opening[0].length : 0;
	return html.slice(0, at) + SHIM_TAG + html.slice(at);
}

/**
 * Content scripts, and extension pages in a website's iframe, run where no
 * session preload reaches. The storage shim goes into the extension's folder
 * as the first script of each content script and page.
 */
export async function addStorageShimFiles(
	extensionPath: string,
): Promise<void> {
	await writeFile(
		path.join(extensionPath, STORAGE_SHIM_SCRIPT),
		`(${shimChromeStorage})(false);\n`,
	);

	const manifestPath = path.join(extensionPath, "manifest.json");
	const manifest: { content_scripts?: ContentScript[] } = JSON.parse(
		(await readFile(manifestPath, "utf8")).replace(/^\uFEFF/, ""),
	);
	const unshimmed = (manifest.content_scripts ?? []).filter(
		(script) =>
			script.world !== "MAIN" &&
			script.js?.length &&
			script.js[0] !== STORAGE_SHIM_SCRIPT,
	);
	for (const script of unshimmed) {
		script.js = [STORAGE_SHIM_SCRIPT, ...(script.js ?? [])];
	}
	if (unshimmed.length > 0) {
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
	}

	const files = await readdir(extensionPath, { recursive: true });
	for (const file of files) {
		if (!/\.html?$/i.test(file)) continue;
		const pagePath = path.join(extensionPath, file);
		const shimmed = withShimTag(await readFile(pagePath, "utf8"));
		if (shimmed !== null) await writeFile(pagePath, shimmed);
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
