import { ClipboardItem, clipboard, type NativeImage } from "electron";

// Electron 44 removed clipboard.writeImage; images go through the W3C-style
// clipboard.write with an image/png item.
export function writeClipboardImage(image: NativeImage): Promise<void> {
	return clipboard.write([
		new ClipboardItem({
			"image/png": new Blob([new Uint8Array(image.toPNG())], {
				type: "image/png",
			}),
		}),
	]);
}
