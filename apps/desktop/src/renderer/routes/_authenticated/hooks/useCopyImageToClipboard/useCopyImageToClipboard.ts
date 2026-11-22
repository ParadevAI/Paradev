import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { fileToBase64 } from "renderer/lib/file-to-base64";
import {
	copyImageToClipboard,
	type PngWriter,
	writePngToClipboard,
} from "renderer/routes/_authenticated/components/ImagePreviewOverlay/utils/copyImageToClipboard";

/** The browser clipboard refuses a write when the page lacks focus; the main process does not. */
export function useCopyImageToClipboard({
	writeInRenderer = writePngToClipboard,
	toBase64 = fileToBase64,
}: {
	writeInRenderer?: PngWriter;
	toBase64?: (blob: Blob) => Promise<string>;
} = {}): (src: string) => Promise<void> {
	const { mutateAsync } = electronTrpc.external.copyImage.useMutation();
	return useCallback(
		(src: string) =>
			copyImageToClipboard(src, async (png) => {
				try {
					await writeInRenderer(png);
				} catch {
					await mutateAsync({ pngBase64: await toBase64(png) });
				}
			}),
		[mutateAsync, writeInRenderer, toBase64],
	);
}
