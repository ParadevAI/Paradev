import { describe, expect, test } from "bun:test";
import { encodeWav } from "./encodeWav";

describe("encodeWav", () => {
	test("writes a mono 16-bit PCM header and clamped samples", () => {
		const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 16_000);
		const view = new DataView(bytes.buffer);
		const ascii = (offset: number) =>
			String.fromCharCode(...bytes.subarray(offset, offset + 4));
		expect([ascii(0), ascii(8), ascii(12), ascii(36)]).toEqual([
			"RIFF",
			"WAVE",
			"fmt ",
			"data",
		]);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(16_000);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(8);
		expect(bytes.length).toBe(44 + 8);
		expect([0, 1, 2, 3].map((i) => view.getInt16(44 + i * 2, true))).toEqual([
			0, 32767, -32768, 32767,
		]);
	});
});
