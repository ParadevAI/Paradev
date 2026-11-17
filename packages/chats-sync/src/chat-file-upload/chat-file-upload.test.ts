import { describe, expect, test } from "bun:test";
import { FILE_PART_BYTES } from "@superset/chats-core";
import { uploadChatFile } from "./chat-file-upload.ts";

/** An API that records the calls in order and answers as the server does. */
function fakeApi() {
	const calls: unknown[][] = [];
	const api = {
		beginFileUpload: async (
			groupId: string,
			body: { name: string; size: number },
		) => {
			calls.push(["begin", groupId, body]);
			return {
				uploadId: "u1",
				partBytes: FILE_PART_BYTES,
				parts: Math.ceil(body.size / FILE_PART_BYTES),
			};
		},
		putFilePart: async (
			groupId: string,
			uploadId: string,
			index: number,
			bytes: Uint8Array,
		) => {
			// A slow first part must still land before the second is sent.
			if (index === 0) await new Promise((r) => setTimeout(r, 5));
			calls.push(["part", groupId, uploadId, index, bytes.byteLength]);
		},
		finishFileUpload: async (groupId: string, body: object) => {
			calls.push(["finish", groupId, body]);
			return { file: { id: "u1" }, message: { id: "m1" } } as never;
		},
	};
	return { api, calls };
}

describe("uploading a file to a chat", () => {
	test("sends the file in parts of FILE_PART_BYTES, in order, then posts it with its hash and caption", async () => {
		const { api, calls } = fakeApi();
		const size = FILE_PART_BYTES * 2 + 10;
		const reads: [number, number, number][] = [];
		const progress: [number, number][] = [];
		const result = await uploadChatFile(api, {
			groupId: "g1",
			name: "trip.zip",
			size,
			sha256: "ab".repeat(32),
			message: "photos",
			clientId: "c1",
			readPart: async (index, start, end) => {
				reads.push([index, start, end]);
				return new Uint8Array(end - start);
			},
			onProgress: (sent, total) => progress.push([sent, total]),
		});
		expect(result).toEqual({
			file: { id: "u1" },
			message: { id: "m1" },
		} as never);
		expect(reads).toEqual([
			[0, 0, FILE_PART_BYTES],
			[1, FILE_PART_BYTES, FILE_PART_BYTES * 2],
			[2, FILE_PART_BYTES * 2, size],
		]);
		expect(calls).toEqual([
			["begin", "g1", { name: "trip.zip", size }],
			["part", "g1", "u1", 0, FILE_PART_BYTES],
			["part", "g1", "u1", 1, FILE_PART_BYTES],
			["part", "g1", "u1", 2, 10],
			[
				"finish",
				"g1",
				{
					uploadId: "u1",
					name: "trip.zip",
					size,
					sha256: "ab".repeat(32),
					message: "photos",
					clientId: "c1",
				},
			],
		]);
		expect(progress).toEqual([
			[FILE_PART_BYTES, size],
			[FILE_PART_BYTES * 2, size],
			[size, size],
		]);
	});

	test("a refused upload sends no part", async () => {
		const { api, calls } = fakeApi();
		api.beginFileUpload = async () => {
			throw new Error("Files like page.html can't be shared");
		};
		const readPart = async () => new Uint8Array(1);
		await expect(
			uploadChatFile(api, {
				groupId: "g1",
				name: "page.html",
				size: 1,
				sha256: "",
				readPart,
			}),
		).rejects.toThrow("can't be shared");
		expect(calls).toEqual([]);
	});
});
