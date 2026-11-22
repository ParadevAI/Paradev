import fs from "node:fs";
import path from "node:path";
import { imageSize } from "image-size";

export interface ImageDimensions {
	width: number;
	height: number;
}

// Most images keep their size in the first bytes; a JPEG with large metadata
// can keep it further in, so a failed parse falls back to the whole file
const HEADER_BYTES = 64 * 1024;
const cache = new Map<string, ImageDimensions | null>();

// Functions do not bundle public/images (see next.config.ts), so a render
// outside the build gets null and the image keeps its old, unsized layout.
export function getPublicImageSize(
	src: string,
	publicDir = path.join(process.cwd(), "public"),
): ImageDimensions | null {
	if (!src.startsWith("/") || src.startsWith("//")) return null;
	let pathname: string;
	try {
		pathname = decodeURIComponent(src.split(/[?#]/)[0] ?? "");
	} catch {
		return null;
	}
	const filePath = path.join(publicDir, pathname);
	if (!filePath.startsWith(publicDir + path.sep)) return null;

	const cached = cache.get(filePath);
	if (cached !== undefined) return cached;

	let dimensions: ImageDimensions | null = null;
	try {
		const { width, height } = readImageSize(filePath);
		if (width && height) dimensions = { width, height };
	} catch {}
	cache.set(filePath, dimensions);
	return dimensions;
}

function readImageSize(filePath: string) {
	const header = Buffer.alloc(HEADER_BYTES);
	const fd = fs.openSync(filePath, "r");
	let bytesRead: number;
	try {
		bytesRead = fs.readSync(fd, header, 0, HEADER_BYTES, 0);
	} finally {
		fs.closeSync(fd);
	}
	try {
		return imageSize(header.subarray(0, bytesRead));
	} catch {
		return imageSize(fs.readFileSync(filePath));
	}
}
