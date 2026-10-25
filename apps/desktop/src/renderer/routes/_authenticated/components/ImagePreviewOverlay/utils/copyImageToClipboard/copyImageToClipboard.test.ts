import { describe, expect, mock, test } from "bun:test";
import { copyImageToClipboard } from "./copyImageToClipboard";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("copyImageToClipboard", () => {
	test("hands a PNG source to the writer as it is", async () => {
		const write = mock(async (_png: Blob) => {});
		await copyImageToClipboard(PNG, write);
		expect(write).toHaveBeenCalledTimes(1);
		const [png] = write.mock.calls[0] as [Blob];
		expect(png.type).toBe("image/png");
		expect(png.size).toBe(8);
	});

	test("re-encodes any other format to PNG before writing", async () => {
		const png = new Blob(["png"], { type: "image/png" });
		const toPng = mock(async (_image: Blob) => png);
		const write = mock(async (_png: Blob) => {});
		await copyImageToClipboard("data:image/jpeg;base64,/9j/4AAQ", write, toPng);
		const [source] = toPng.mock.calls[0] as [Blob];
		expect(source.type).toBe("image/jpeg");
		expect(write.mock.calls[0]?.[0]).toBe(png);
	});

	test("a failed re-encode fails the copy and writes nothing", async () => {
		const write = mock(async (_png: Blob) => {});
		const toPng = mock(async () => {
			throw new Error("decode failed");
		});
		await expect(
			copyImageToClipboard("data:image/webp;base64,UklGRg==", write, toPng),
		).rejects.toThrow("decode failed");
		expect(write).not.toHaveBeenCalled();
	});

	test("a writer that rejects fails the copy", async () => {
		const write = mock(async () => {
			throw new Error("clipboard busy");
		});
		await expect(copyImageToClipboard(PNG, write)).rejects.toThrow(
			"clipboard busy",
		);
	});
});
