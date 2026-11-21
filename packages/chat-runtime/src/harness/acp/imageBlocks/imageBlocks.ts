import { isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import type { AcpContentBlock } from "../wire";

export type AcpImageSource =
	| { kind: "bytes"; mimeType: string; bytes: Uint8Array; name?: string }
	| { kind: "file"; mimeType: string; path: string; name?: string };

const MIME_BY_EXTENSION: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	bmp: "image/bmp",
	svg: "image/svg+xml",
	ico: "image/x-icon",
	avif: "image/avif",
};

function isImageMime(mimeType: unknown): mimeType is string {
	return typeof mimeType === "string" && mimeType.startsWith("image/");
}

function mimeOfPath(path: string): string | null {
	const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
	return MIME_BY_EXTENSION[extension] ?? null;
}

function localPathOf(uri: unknown): string | null {
	if (typeof uri !== "string") return null;
	if (isAbsolute(uri)) return uri;
	try {
		const url = new URL(uri);
		// Bun's fileURLToPath tolerates malformed escapes that Node rejects.
		decodeURIComponent(url.pathname);
		return fileURLToPath(url);
	} catch {
		return null;
	}
}

function nameOf(block: AcpContentBlock): string | undefined {
	const { name, title } = block as { name?: unknown; title?: unknown };
	if (typeof name === "string" && name !== "") return name;
	if (typeof title === "string" && title !== "") return title;
	return undefined;
}

export function imageSourceOf(
	block: AcpContentBlock | undefined,
): AcpImageSource | null {
	if (!block) return null;
	const name = nameOf(block);
	if (block.type === "image") {
		const { data, mimeType } = block as { data?: unknown; mimeType?: unknown };
		if (typeof data !== "string" || data === "" || !isImageMime(mimeType))
			return null;
		return {
			kind: "bytes",
			mimeType,
			bytes: new Uint8Array(Buffer.from(data, "base64")),
			...(name ? { name } : {}),
		};
	}
	if (block.type === "resource_link") {
		const { uri, mimeType } = block as { uri?: unknown; mimeType?: unknown };
		const path = localPathOf(uri);
		if (!path) return null;
		const resolvedMime = isImageMime(mimeType) ? mimeType : mimeOfPath(path);
		if (!resolvedMime) return null;
		return {
			kind: "file",
			mimeType: resolvedMime,
			path,
			...(name ? { name } : {}),
		};
	}
	return null;
}

export { withoutImageData } from "../withoutImageData";
