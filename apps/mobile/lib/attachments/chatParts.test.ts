import { beforeAll, describe, expect, test } from "bun:test";
import { initI18n } from "@superset/i18n";
import { MAX_INLINE_ATTACHMENT_BYTES } from "@superset/shared/attachment-limits";
import {
	AttachmentLimitError,
	type ChatAttachmentFile,
	type ChatPartsDeps,
	chatAttachmentParts,
} from "./chatParts";

const FILE_ID = "8c1f6f8e-3a2b-4c5d-9e0f-112233445566";

function file(name: string, size = 3): ChatAttachmentFile {
	return {
		name,
		mimeType: "image/png",
		size,
		readBase64: async () => "AQID",
	};
}

function recordingDeps() {
	const calls: string[] = [];
	const deps: ChatPartsDeps = {
		awaitUploads: async () => {
			calls.push("awaitUploads");
			return [FILE_ID];
		},
		attachFiles: async () => {
			calls.push("attachFiles");
		},
		importFromCloud: async () => {
			calls.push("importFromCloud");
			return [
				{
					attachmentId: "imported",
					originalFilename: "shot.png",
					mediaType: "image/png",
					sizeBytes: 3,
				},
			];
		},
		hostUpload: async (input) => {
			calls.push(`hostUpload:${input.data.data}`);
			return { attachmentId: "host-1", mediaType: "image/png", sizeBytes: 3 };
		},
	};
	return { deps, calls };
}

beforeAll(() => initI18n());

describe("chatAttachmentParts", () => {
	test("a cloud part carries its fileId and skips the import", async () => {
		const { deps, calls } = recordingDeps();
		const parts = await chatAttachmentParts({
			home: "cloud",
			readsParts: true,
			files: [file("shot.png")],
			deps,
		});
		expect(parts).toEqual([
			{
				type: "attachment",
				fileId: FILE_ID,
				name: "shot.png",
				mimeType: "image/png",
				sizeBytes: 3,
			},
		]);
		expect(calls).toEqual(["awaitUploads", "attachFiles"]);
	});

	test("a box too old to read parts gets the copy it imports", async () => {
		const { deps, calls } = recordingDeps();
		const parts = await chatAttachmentParts({
			home: "cloud",
			readsParts: false,
			files: [file("shot.png")],
			deps,
		});
		expect(parts[0]?.attachmentId).toBe("imported");
		expect(parts[0]?.fileId).toBeUndefined();
		expect(calls).toEqual(["awaitUploads", "attachFiles", "importFromCloud"]);
	});

	test("a host part goes to the host in the request and never to storage", async () => {
		const { deps, calls } = recordingDeps();
		const parts = await chatAttachmentParts({
			home: "host",
			readsParts: true,
			files: [file("shot.png")],
			deps,
		});
		expect(parts).toEqual([
			{
				type: "attachment",
				attachmentId: "host-1",
				name: "shot.png",
				mimeType: "image/png",
				sizeBytes: 3,
			},
		]);
		expect(calls).toEqual(["hostUpload:AQID"]);
	});

	test("a host refuses a file over the inline cap before sending anything", async () => {
		const { deps, calls } = recordingDeps();
		await expect(
			chatAttachmentParts({
				home: "host",
				readsParts: true,
				files: [file("big.png", MAX_INLINE_ATTACHMENT_BYTES + 1)],
				deps,
			}),
		).rejects.toBeInstanceOf(AttachmentLimitError);
		expect(calls).toEqual([]);
	});
});
