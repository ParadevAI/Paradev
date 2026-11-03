import { expect, test } from "bun:test";
import { readBodyWithin } from "./readBodyWithin";

function streamOf(chunks: string[]) {
	let pulled = 0;
	let cancelled = false;
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			const chunk = chunks[pulled++];
			if (chunk === undefined) controller.close();
			else controller.enqueue(encoder.encode(chunk));
		},
		cancel() {
			cancelled = true;
		},
	});
	return { stream, pulled: () => pulled, cancelled: () => cancelled };
}

test("reads a body within the limit", async () => {
	const { stream } = streamOf(['{"a":', "1}"]);
	expect(await readBodyWithin(stream, 16)).toBe('{"a":1}');
});

test("stops at the first chunk past the limit and cancels the stream", async () => {
	const body = streamOf(["12345", "67890", "never read"]);
	expect(await readBodyWithin(body.stream, 8)).toBeNull();
	expect(body.pulled()).toBe(2);
	expect(body.cancelled()).toBe(true);
});

test("a missing body reads as empty", async () => {
	expect(await readBodyWithin(null, 8)).toBe("");
});
