export type ImageDimensions = { width: number; height: number };

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_FRAME_MARKERS = new Set([
	0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
	return prefix.every((byte, index) => bytes[index] === byte);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
	return String.fromCharCode(...bytes.subarray(start, end));
}

function pngDimensions(bytes: Uint8Array): ImageDimensions | null {
	if (bytes.length < 24 || !startsWith(bytes, PNG_SIGNATURE)) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint32(16), height: view.getUint32(20) };
}

function gifDimensions(bytes: Uint8Array): ImageDimensions | null {
	if (bytes.length < 10) return null;
	const header = ascii(bytes, 0, 6);
	if (header !== "GIF87a" && header !== "GIF89a") return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

function jpegDimensions(bytes: Uint8Array): ImageDimensions | null {
	if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let offset = 2;
	while (offset + 4 <= bytes.length) {
		if (bytes[offset] !== 0xff) return null;
		const marker = bytes[offset + 1] as number;
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		if (JPEG_FRAME_MARKERS.has(marker)) {
			if (offset + 9 > bytes.length) return null;
			return {
				height: view.getUint16(offset + 5),
				width: view.getUint16(offset + 7),
			};
		}
		offset += 2 + view.getUint16(offset + 2);
	}
	return null;
}

export function imageDimensions(bytes: Uint8Array): ImageDimensions | null {
	const dimensions =
		pngDimensions(bytes) ?? gifDimensions(bytes) ?? jpegDimensions(bytes);
	return dimensions && dimensions.width > 0 && dimensions.height > 0
		? dimensions
		: null;
}
