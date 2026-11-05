import { describe, expect, it } from "bun:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { imageSourceOf, withoutImageData } from "./imageBlocks";

describe("imageSourceOf", () => {
	it("decodes an image block into bytes", () => {
		const source = imageSourceOf({
			type: "image",
			data: Buffer.from("png-bytes").toString("base64"),
			mimeType: "image/png",
		});
		expect(source?.kind).toBe("bytes");
		expect(source?.mimeType).toBe("image/png");
		expect(
			source?.kind === "bytes" ? Buffer.from(source.bytes).toString() : "",
		).toBe("png-bytes");
	});

	it("points at a linked image file, typing it by extension when the link does not", () => {
		expect(
			imageSourceOf({
				type: "resource_link",
				uri: "file:///work/shots/home%20page.PNG",
				name: "home page.PNG",
			}),
		).toEqual({
			kind: "file",
			mimeType: "image/png",
			path: "/work/shots/home page.PNG",
			name: "home page.PNG",
		});
	});

	it("ignores blocks that carry no image", () => {
		expect(imageSourceOf({ type: "text", text: "hi" })).toBe(null);
		expect(imageSourceOf({ type: "image", mimeType: "image/png" })).toBe(null);
		expect(
			imageSourceOf({ type: "image", data: "YQ==", mimeType: "audio/mpeg" }),
		).toBe(null);
		expect(
			imageSourceOf({ type: "resource_link", uri: "file:///work/notes.md" }),
		).toBe(null);
		expect(
			imageSourceOf({
				type: "resource_link",
				uri: "https://example.com/shot.png",
			}),
		).toBe(null);
	});

	it("ignores a link whose path cannot be decoded", () => {
		expect(
			imageSourceOf({ type: "resource_link", uri: "file:///tmp/100%.png" }),
		).toBe(null);
	});

	it("accepts absolute file paths without URL-decoding their names", () => {
		const path = join(tmpdir(), "shot 100% #1.png");
		expect(imageSourceOf({ type: "resource_link", uri: path })).toEqual({
			kind: "file",
			mimeType: "image/png",
			path,
		});
	});

	it("decodes local file URLs with a localhost authority", () => {
		const path = join(tmpdir(), "shot #1.png");
		const uri = pathToFileURL(path);
		uri.hostname = "localhost";
		expect(imageSourceOf({ type: "resource_link", uri: uri.href })).toEqual({
			kind: "file",
			mimeType: "image/png",
			path,
		});
	});
});

describe("withoutImageData", () => {
	it("empties both payload fields and any nested image blocks", () => {
		const raw = {
			type: "image",
			data: "QUJD",
			source: { type: "base64", data: "REVG" },
			preview: { type: "image", data: "R0hJ" },
		};
		expect(withoutImageData(raw)).toEqual({
			type: "image",
			data: "",
			source: { type: "base64", data: "" },
			preview: { type: "image", data: "" },
		});
		expect(raw.source.data).toBe("REVG");
	});

	it("empties inline image payloads in either shape and leaves the rest alone", () => {
		const raw = {
			content: [
				{ type: "text", text: "ok" },
				{ type: "image", data: "QUJD", mimeType: "image/png" },
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: "QUJD" },
				},
			],
			note: "keep",
		};
		expect(withoutImageData(raw)).toEqual({
			content: [
				{ type: "text", text: "ok" },
				{ type: "image", data: "", mimeType: "image/png" },
				{
					type: "image",
					source: { type: "base64", media_type: "image/png", data: "" },
				},
			],
			note: "keep",
		});
		const plain = { content: [{ type: "text", text: "ok" }] };
		expect(withoutImageData(plain)).toBe(plain);
	});
});
