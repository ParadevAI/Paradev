import { describe, expect, it } from "bun:test";
import { imageDimensions } from "./imageDimensions";

function png(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(33);
	bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
	const view = new DataView(bytes.buffer);
	view.setUint32(8, 13);
	bytes.set([0x49, 0x48, 0x44, 0x52], 12);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
}

function gif(width: number, height: number): Uint8Array {
	const bytes = new Uint8Array(13);
	bytes.set([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
	const view = new DataView(bytes.buffer);
	view.setUint16(6, width, true);
	view.setUint16(8, height, true);
	return bytes;
}

function jpeg(width: number, height: number): Uint8Array {
	const app0 = [0xff, 0xe0, 0x00, 0x04, 0x4a, 0x46];
	const sof0 = [0xff, 0xc0, 0x00, 0x0b, 0x08, 0, 0, 0, 0, 0x01, 0x01, 0x11, 0];
	const bytes = new Uint8Array([0xff, 0xd8, ...app0, ...sof0]);
	const view = new DataView(bytes.buffer);
	view.setUint16(2 + app0.length + 5, height);
	view.setUint16(2 + app0.length + 7, width);
	return bytes;
}

describe("imageDimensions", () => {
	it.each([
		["png", png(1280, 720), { width: 1280, height: 720 }],
		["gif", gif(320, 240), { width: 320, height: 240 }],
		["jpeg", jpeg(4032, 3024), { width: 4032, height: 3024 }],
	])("reads the size of a %s header", (_format, bytes, expected) => {
		expect(imageDimensions(bytes)).toEqual(expected);
	});

	it("answers null for bytes it does not read", () => {
		expect(imageDimensions(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBe(
			null,
		);
		expect(imageDimensions(png(0, 10))).toBe(null);
	});
});
