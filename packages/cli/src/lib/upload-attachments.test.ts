import { afterAll, describe, expect, it } from "bun:test";
import {
	closeSync,
	ftruncateSync,
	mkdtempSync,
	openSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	MAX_INLINE_ATTACHMENT_BYTES,
} from "@superset/shared/attachment-limits";
import type { ApiClient } from "./api-client";
import type { HostServiceClient } from "./host-target";
import { uploadAttachments, uploadToCloudStorage } from "./upload-attachments";

const dir = mkdtempSync(join(tmpdir(), "upload-attachments-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function fileOfSize(name: string, sizeBytes: number): string {
	const path = join(dir, name);
	const fd = openSync(path, "w");
	ftruncateSync(fd, sizeBytes);
	closeSync(fd);
	return path;
}

const small = join(dir, "notes.md");
writeFileSync(small, "# notes");
const large = fileOfSize("dump.zip", MAX_INLINE_ATTACHMENT_BYTES + 1);

function recorder() {
	const calls: string[] = [];
	const client = {
		attachments: {
			upload: {
				mutate: async (input: { originalFilename: string }) => {
					calls.push(`inline:${input.originalFilename}`);
					return { attachmentId: `inline-${input.originalFilename}` };
				},
			},
			importFromCloud: {
				mutate: async ({ fileIds }: { fileIds: string[] }) => {
					calls.push(`import:${fileIds.join(",")}`);
					return fileIds.map((fileId) => ({
						attachmentId: `imported-${fileId}`,
					}));
				},
			},
		},
	} as unknown as HostServiceClient;
	const api = {
		attachment: {
			createUpload: {
				mutate: async (input: { name: string; sizeBytes: number }) => {
					calls.push(`createUpload:${input.name}:${input.sizeBytes}`);
					return {
						fileId: `file-${input.name}`,
						upload: { url: "https://storage.test/put", headers: {} },
					};
				},
			},
		},
	} as unknown as ApiClient;
	const fetchImpl = (async (_url: string, init?: RequestInit) => {
		calls.push(`put:${init?.method}`);
		return new Response(null, { status: 200 });
	}) as unknown as typeof fetch;
	return { calls, client, api, fetchImpl };
}

describe("uploadAttachments", () => {
	it("refuses a file over the inline limit for a host before sending anything", async () => {
		const { calls, client, api, fetchImpl } = recorder();
		await expect(
			uploadAttachments({
				target: { kind: "remote", client },
				api,
				paths: [small, large],
				fetchImpl,
			}),
		).rejects.toThrow("a workspace on a host takes at most 25 MB a file");
		expect(calls).toEqual([]);
	});

	it("sends small files inline and larger ones through storage to a cloud workspace, in order", async () => {
		const { calls, client, api, fetchImpl } = recorder();
		const ids = await uploadAttachments({
			target: { kind: "cloud", client },
			api,
			paths: [large, small],
			fetchImpl,
		});
		expect(ids).toEqual(["imported-file-dump.zip", "inline-notes.md"]);
		expect(calls).toEqual([
			`createUpload:dump.zip:${MAX_INLINE_ATTACHMENT_BYTES + 1}`,
			"put:PUT",
			"import:file-dump.zip",
			"inline:notes.md",
		]);
	});

	it("says when a cloud workspace's host is too old for large files", async () => {
		const { client, api, fetchImpl } = recorder();
		const oldHost = {
			attachments: {
				...client.attachments,
				importFromCloud: {
					mutate: async () => {
						throw new Error(
							'No procedure found on path "attachments.importFromCloud"',
						);
					},
				},
			},
		} as unknown as HostServiceClient;
		await expect(
			uploadAttachments({
				target: { kind: "cloud", client: oldHost },
				api,
				paths: [large],
				fetchImpl,
			}),
		).rejects.toThrow("This workspace's host is too old for files over 25 MB");
	});

	it("refuses a file over the storage limit for a cloud workspace", async () => {
		const { calls, client, api, fetchImpl } = recorder();
		const huge = fileOfSize("huge.zip", MAX_ATTACHMENT_BYTES + 1);
		await expect(
			uploadAttachments({
				target: { kind: "cloud", client },
				api,
				paths: [huge],
				fetchImpl,
			}),
		).rejects.toThrow("the limit is 200 MB a file");
		expect(calls).toEqual([]);
	});
});

describe("uploadToCloudStorage", () => {
	it("uploads each file and returns its file id", async () => {
		const { calls, api, fetchImpl } = recorder();
		expect(
			await uploadToCloudStorage({ api, paths: [small], fetchImpl }),
		).toEqual(["file-notes.md"]);
		expect(calls).toEqual(["createUpload:notes.md:7", "put:PUT"]);
	});

	it("refuses more files than one send carries", async () => {
		const { api, fetchImpl } = recorder();
		await expect(
			uploadToCloudStorage({
				api,
				paths: Array.from({ length: MAX_ATTACHMENTS + 1 }, () => small),
				fetchImpl,
			}),
		).rejects.toThrow(`At most ${MAX_ATTACHMENTS} attachments`);
	});
});
