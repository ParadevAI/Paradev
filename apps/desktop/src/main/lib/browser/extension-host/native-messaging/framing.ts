import { endianness } from "node:os";

const HEADER_BYTES = 4;
/** Chrome's limit for one message from a native host. */
export const MAX_HOST_MESSAGE_BYTES = 1024 * 1024;
const MAX_FRAME_BYTES = 0xffffffff;

const littleEndian = endianness() === "LE";
const utf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** A message to a host: its UTF-8 length in native byte order, then the JSON. */
export function encodeNativeMessage(json: string): Buffer {
	const body = Buffer.from(json, "utf8");
	if (body.length > MAX_FRAME_BYTES) {
		throw new Error("The message is too large for a native host.");
	}
	const frame = Buffer.allocUnsafe(HEADER_BYTES + body.length);
	if (littleEndian) frame.writeUInt32LE(body.length, 0);
	else frame.writeUInt32BE(body.length, 0);
	body.copy(frame, HEADER_BYTES);
	return frame;
}

/**
 * Splits a host's stdout into messages. After the first error it reads
 * nothing more, as Chrome closes the port on it.
 */
export function createNativeMessageReader(handlers: {
	onMessage: (json: string) => void;
	onError: (reason: string) => void;
}): (chunk: Buffer) => void {
	let pending: Buffer = Buffer.alloc(0);
	let failed = false;
	return (chunk) => {
		if (failed) return;
		pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
		while (pending.length >= HEADER_BYTES) {
			const length = littleEndian
				? pending.readUInt32LE(0)
				: pending.readUInt32BE(0);
			if (length > MAX_HOST_MESSAGE_BYTES) {
				failed = true;
				handlers.onError(
					`The native host sent a message of ${length} bytes; the limit is ${MAX_HOST_MESSAGE_BYTES}.`,
				);
				return;
			}
			if (pending.length < HEADER_BYTES + length) return;
			const body = pending.subarray(HEADER_BYTES, HEADER_BYTES + length);
			pending = pending.subarray(HEADER_BYTES + length);
			let json: string;
			try {
				json = utf8.decode(body);
				JSON.parse(json);
			} catch {
				failed = true;
				handlers.onError(
					"The native host sent a message that is not UTF-8 JSON.",
				);
				return;
			}
			handlers.onMessage(json);
		}
	};
}
