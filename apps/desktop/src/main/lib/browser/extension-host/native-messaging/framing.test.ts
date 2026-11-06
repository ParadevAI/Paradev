import { expect, test } from "bun:test";
import {
	createNativeMessageReader,
	encodeNativeMessage,
	MAX_HOST_MESSAGE_BYTES,
} from "./framing";

function reader() {
	const messages: string[] = [];
	const errors: string[] = [];
	const read = createNativeMessageReader({
		onMessage: (json) => messages.push(json),
		onError: (reason) => errors.push(reason),
	});
	return { read, messages, errors };
}

test("a frame is the UTF-8 byte length in native order, then the JSON", () => {
	const frame = encodeNativeMessage('{"text":"héllo"}');
	expect(frame.readUInt32LE(0)).toBe(Buffer.byteLength('{"text":"héllo"}'));
	expect(frame.subarray(4).toString("utf8")).toBe('{"text":"héllo"}');
});

test("messages split across chunks and packed into one chunk both arrive whole", () => {
	const { read, messages, errors } = reader();
	const stream = Buffer.concat([
		encodeNativeMessage('{"a":"日本"}'),
		encodeNativeMessage("[1,2,3]"),
	]);
	for (let i = 0; i < 7; i++) read(stream.subarray(i, i + 1));
	read(stream.subarray(7));
	expect(messages).toEqual(['{"a":"日本"}', "[1,2,3]"]);
	expect(errors).toEqual([]);
});

test("a host message over 1 MB or not JSON closes the stream", () => {
	const big = reader();
	const header = Buffer.alloc(4);
	header.writeUInt32LE(MAX_HOST_MESSAGE_BYTES + 1, 0);
	big.read(header);
	big.read(encodeNativeMessage("{}"));
	expect(big.errors).toHaveLength(1);
	expect(big.messages).toEqual([]);

	const garbage = reader();
	garbage.read(encodeNativeMessage("not json"));
	garbage.read(encodeNativeMessage("{}"));
	expect(garbage.errors).toHaveLength(1);
	expect(garbage.messages).toEqual([]);

	const atLimit = reader();
	const json = `"${"x".repeat(MAX_HOST_MESSAGE_BYTES - 2)}"`;
	atLimit.read(encodeNativeMessage(json));
	expect(atLimit.messages).toEqual([json]);
});

test("a host message that is not valid UTF-8 closes the stream instead of arriving altered", () => {
	const invalid = reader();
	const body = Buffer.from([0x22, 0xff, 0x22]);
	const header = Buffer.alloc(4);
	header.writeUInt32LE(body.length, 0);
	invalid.read(Buffer.concat([header, body]));
	expect(invalid.messages).toEqual([]);
	expect(invalid.errors).toHaveLength(1);
});
