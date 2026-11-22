import { inflateRawSync } from "node:zlib";

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_FILE_HEADER = 0x04034b50;
const END_RECORD_SIZE = 22;
const MAX_COMMENT_SIZE = 0xffff;
const COMPRESSION = { stored: 0, deflate: 8 } as const;

/** Bytes of one file in a zip archive, or null when the archive has no such file. */
export function readZipEntry(zip: Buffer, name: string): Buffer | null {
	const end = findEndRecord(zip);
	const count = zip.readUInt16LE(end + 10);
	let offset = zip.readUInt32LE(end + 16);
	for (let index = 0; index < count; index++) {
		if (zip.readUInt32LE(offset) !== CENTRAL_DIRECTORY_ENTRY) {
			throw new Error("Zip central directory is malformed");
		}
		const method = zip.readUInt16LE(offset + 10);
		const compressedSize = zip.readUInt32LE(offset + 20);
		const size = zip.readUInt32LE(offset + 24);
		const nameLength = zip.readUInt16LE(offset + 28);
		const extraLength = zip.readUInt16LE(offset + 30);
		const commentLength = zip.readUInt16LE(offset + 32);
		const localOffset = zip.readUInt32LE(offset + 42);
		const entryName = zip.toString(
			"utf8",
			offset + 46,
			offset + 46 + nameLength,
		);
		offset += 46 + nameLength + extraLength + commentLength;
		if (entryName !== name) continue;

		if (zip.readUInt32LE(localOffset) !== LOCAL_FILE_HEADER) {
			throw new Error("Zip local header is malformed");
		}
		const dataStart =
			localOffset +
			30 +
			zip.readUInt16LE(localOffset + 26) +
			zip.readUInt16LE(localOffset + 28);
		const data = zip.subarray(dataStart, dataStart + compressedSize);
		if (data.length !== compressedSize)
			throw new Error(`Zip entry ${name} is truncated`);
		const content =
			method === COMPRESSION.stored
				? Buffer.from(data)
				: method === COMPRESSION.deflate
					? inflateRawSync(data, { maxOutputLength: Math.max(size, 1) })
					: null;
		if (!content) throw new Error(`Zip entry ${name} uses method ${method}`);
		if (content.length !== size)
			throw new Error(`Zip entry ${name} is truncated`);
		return content;
	}
	return null;
}

function findEndRecord(zip: Buffer): number {
	const lowest = Math.max(0, zip.length - END_RECORD_SIZE - MAX_COMMENT_SIZE);
	for (let offset = zip.length - END_RECORD_SIZE; offset >= lowest; offset--) {
		if (
			zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY &&
			offset + END_RECORD_SIZE + zip.readUInt16LE(offset + 20) === zip.length
		)
			return offset;
	}
	throw new Error("Not a zip archive");
}
