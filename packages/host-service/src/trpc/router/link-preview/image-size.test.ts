import { describe, expect, it } from "bun:test";
import { imageSize } from "./image-size";

const bytes = (...values: number[]) => new Uint8Array(values);

describe("imageSize", () => {
	it("reads a PNG header", () => {
		const png = new Uint8Array(24);
		png.set([0x89, 0x50, 0x4e, 0x47]);
		new DataView(png.buffer).setUint32(16, 1200);
		new DataView(png.buffer).setUint32(20, 630);
		expect(imageSize(png, "image/png")).toEqual({ width: 1200, height: 630 });
	});

	it("reads a GIF header", () => {
		const gif = bytes(
			0x47,
			0x49,
			0x46,
			0x38,
			0x39,
			0x61,
			0x40,
			0x01,
			0xf0,
			0x00,
		);
		expect(imageSize(gif, "image/gif")).toEqual({ width: 320, height: 240 });
	});

	it("finds the frame size of a JPEG past other segments", () => {
		const jpeg = bytes(
			0xff,
			0xd8,
			0xff,
			0xe0,
			0x00,
			0x04,
			0x00,
			0x00,
			0xff,
			0xc0,
			0x00,
			0x11,
			0x08,
			0x02,
			0x76,
			0x04,
			0xb0,
			0x03,
			0x00,
			0x00,
			0x00,
		);
		expect(imageSize(jpeg, "image/jpeg")).toEqual({ width: 1200, height: 630 });
	});

	it("reads an extended WebP header", () => {
		const webp = new Uint8Array(30);
		webp.set(new TextEncoder().encode("RIFF"), 0);
		webp.set(new TextEncoder().encode("WEBPVP8X"), 8);
		webp.set([0xaf, 0x04, 0x00], 24);
		webp.set([0x75, 0x02, 0x00], 27);
		expect(imageSize(webp, "image/webp")).toEqual({ width: 1200, height: 630 });
	});

	it("is null for a truncated header", () => {
		expect(imageSize(bytes(0x89, 0x50), "image/png")).toBeNull();
		expect(imageSize(bytes(0xff, 0xd8, 0xff, 0xe0), "image/jpeg")).toBeNull();
	});
});
