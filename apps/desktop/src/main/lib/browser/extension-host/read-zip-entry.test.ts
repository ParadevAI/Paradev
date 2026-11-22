import { expect, test } from "bun:test";
import { deflateRawSync } from "node:zlib";
import { readZipEntry } from "./read-zip-entry";

function zipOf(
	name: string,
	content: Buffer,
	options: { deflate?: boolean; size?: number; comment?: Buffer } = {},
): Buffer {
	const data = options.deflate ? deflateRawSync(content) : content;
	const method = options.deflate ? 8 : 0;
	const size = options.size ?? content.length;
	const fileName = Buffer.from(name);
	const local = Buffer.alloc(30);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(method, 8);
	local.writeUInt32LE(data.length, 18);
	local.writeUInt32LE(size, 22);
	local.writeUInt16LE(fileName.length, 26);
	const central = Buffer.alloc(46);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt16LE(method, 10);
	central.writeUInt32LE(data.length, 20);
	central.writeUInt32LE(size, 24);
	central.writeUInt16LE(fileName.length, 28);
	const centralOffset = local.length + fileName.length + data.length;
	const comment = options.comment ?? Buffer.alloc(0);
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(1, 8);
	end.writeUInt16LE(1, 10);
	end.writeUInt32LE(central.length + fileName.length, 12);
	end.writeUInt32LE(centralOffset, 16);
	end.writeUInt16LE(comment.length, 20);
	return Buffer.concat([
		local,
		fileName,
		data,
		central,
		fileName,
		end,
		comment,
	]);
}

test("reads stored and deflated entries", () => {
	const content = Buffer.from('{"name":"x"}');
	expect(
		readZipEntry(zipOf("manifest.json", content), "manifest.json"),
	).toEqual(content);
	expect(
		readZipEntry(
			zipOf("manifest.json", content, { deflate: true }),
			"manifest.json",
		),
	).toEqual(content);
	expect(readZipEntry(zipOf("other.json", content), "manifest.json")).toBe(
		null,
	);
});

test("an end-of-directory signature inside the comment is not the end record", () => {
	const content = Buffer.from("hello");
	const comment = Buffer.alloc(30);
	comment.writeUInt32LE(0x06054b50, 4);
	expect(readZipEntry(zipOf("a.txt", content, { comment }), "a.txt")).toEqual(
		content,
	);
});

test("an entry that runs past the archive is rejected", () => {
	const zip = zipOf("a.txt", Buffer.from("hello"), { deflate: true });
	const centralOffset = zip.readUInt32LE(zip.length - 22 + 16);
	zip.writeUInt32LE(0xffff, centralOffset + 20);
	expect(() => readZipEntry(zip, "a.txt")).toThrow("truncated");
});

test("inflation stops at the declared size", () => {
	const zip = zipOf("a.txt", Buffer.alloc(1_000_000), {
		deflate: true,
		size: 10,
	});
	expect(() => readZipEntry(zip, "a.txt")).toThrow(
		expect.objectContaining({ code: "ERR_BUFFER_TOO_LARGE" }),
	);
});
