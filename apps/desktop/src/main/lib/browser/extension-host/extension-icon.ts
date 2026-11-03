import path from "node:path";
import { nativeImage } from "electron";

/** The manifest's largest icon file, relative to the extension folder. */
export function largestIconFile(
	manifest: Pick<chrome.runtime.Manifest, "icons">,
): string | undefined {
	const sizes = Object.keys(manifest.icons ?? {})
		.map(Number)
		.filter(Number.isFinite)
		.sort((a, b) => b - a);
	const [largest] = sizes;
	return largest === undefined ? undefined : manifest.icons?.[largest];
}

/** The extension's icon for a native question, or undefined when it has none that loads. */
export function extensionIcon(
	dir: string,
	manifest: Pick<chrome.runtime.Manifest, "icons">,
): Electron.NativeImage | undefined {
	const file = largestIconFile(manifest);
	if (!file) return undefined;
	const image = nativeImage.createFromPath(
		path.join(dir, file.replace(/^\/+/, "")),
	);
	return image.isEmpty() ? undefined : image;
}
