export type ImageSize = { width: number; height: number };

const JPEG_START_OF_FRAME = new Set([
	0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegSize(view: DataView): ImageSize | null {
	let offset = 2;
	while (offset + 9 < view.byteLength) {
		if (view.getUint8(offset) !== 0xff) return null;
		const marker = view.getUint8(offset + 1);
		if (marker === 0xff) {
			offset += 1;
			continue;
		}
		const length = view.getUint16(offset + 2);
		if (JPEG_START_OF_FRAME.has(marker)) {
			return {
				height: view.getUint16(offset + 5),
				width: view.getUint16(offset + 7),
			};
		}
		if (length < 2) return null;
		offset += 2 + length;
	}
	return null;
}

function webpSize(view: DataView, chunk: string): ImageSize | null {
	if (chunk === "VP8 " && view.byteLength >= 30) {
		return {
			width: view.getUint16(26, true) & 0x3fff,
			height: view.getUint16(28, true) & 0x3fff,
		};
	}
	if (chunk === "VP8L" && view.byteLength >= 25) {
		const bits = view.getUint32(21, true);
		return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
	}
	if (chunk === "VP8X" && view.byteLength >= 30) {
		const read24 = (at: number) =>
			view.getUint8(at) |
			(view.getUint8(at + 1) << 8) |
			(view.getUint8(at + 2) << 16);
		return { width: read24(24) + 1, height: read24(27) + 1 };
	}
	return null;
}

/** Pixel size read from the header of a PNG, JPEG, GIF or WebP, or null. */
export function imageSize(
	bytes: Uint8Array,
	mediaType: string,
): ImageSize | null {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	try {
		switch (mediaType) {
			case "image/png":
				return view.byteLength < 24
					? null
					: { width: view.getUint32(16), height: view.getUint32(20) };
			case "image/gif":
				return view.byteLength < 10
					? null
					: {
							width: view.getUint16(6, true),
							height: view.getUint16(8, true),
						};
			case "image/jpeg":
				return jpegSize(view);
			case "image/webp":
				return webpSize(
					view,
					Buffer.from(bytes.subarray(12, 16)).toString("latin1"),
				);
			default:
				return null;
		}
	} catch {
		return null;
	}
}
