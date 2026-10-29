import { describe, expect, it } from "bun:test";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
} from "@superset/shared/attachment-limits";
import {
	AttachmentLimitError,
	type LocalAttachmentItem,
	type SendAttachmentsDeps,
	sendAttachmentsToWorkspace,
} from "./sendAttachmentsToWorkspace";

interface Recorded {
	uploads: Array<{ name: string; contentType: string; sizeBytes: number }>;
	puts: Array<{ url: string; file: File }>;
	attached: Array<{ id: string; fileIds: string[] }>;
	materialized: Array<{ workspaceId: string; fileIds: string[] }>;
}

function makeDeps(options: { putStatus?: number } = {}) {
	const recorded: Recorded = {
		uploads: [],
		puts: [],
		attached: [],
		materialized: [],
	};
	let nextId = 0;
	const deps: SendAttachmentsDeps = {
		async createUpload(input) {
			recorded.uploads.push(input);
			nextId += 1;
			return {
				fileId: `file-${nextId}`,
				upload: { url: `https://r2.test/${nextId}`, headers: {} },
			};
		},
		async putObject(target, file) {
			recorded.puts.push({ url: target.url, file });
			return new Response(null, { status: options.putStatus ?? 200 });
		},
		async attachFiles(input) {
			recorded.attached.push(input);
		},
		async materialize(input) {
			recorded.materialized.push(input);
			return {
				paths: input.fileIds.map((id) => `.superset/attachments/${id}.png`),
			};
		},
	};
	return { deps, recorded };
}

const png = (name: string, size = 4) =>
	new File([new Uint8Array(size)], name, { type: "image/png" });

describe("sendAttachmentsToWorkspace", () => {
	it("uploads each file to storage, then materializes them by id in order", async () => {
		const { deps, recorded } = makeDeps();
		const paths = await sendAttachmentsToWorkspace({
			deps,
			workspaceId: "ws-1",
			isCloudWorkspace: false,
			files: [png("a.png"), png("b.png", 9)],
		});

		expect(recorded.uploads).toEqual([
			{ name: "a.png", contentType: "image/png", sizeBytes: 4 },
			{ name: "b.png", contentType: "image/png", sizeBytes: 9 },
		]);
		expect(recorded.puts.map((p) => p.url)).toEqual([
			"https://r2.test/1",
			"https://r2.test/2",
		]);
		expect(recorded.materialized).toEqual([
			{ workspaceId: "ws-1", fileIds: ["file-1", "file-2"] },
		]);
		expect(recorded.attached).toEqual([]);
		expect(paths).toEqual([
			".superset/attachments/file-1.png",
			".superset/attachments/file-2.png",
		]);
	});

	it("attaches the files to a cloud workspace before the box fetches them", async () => {
		const { deps, recorded } = makeDeps();
		await sendAttachmentsToWorkspace({
			deps,
			workspaceId: "cloud-ws",
			isCloudWorkspace: true,
			files: [png("shot.png")],
		});
		expect(recorded.attached).toEqual([
			{ id: "cloud-ws", fileIds: ["file-1"] },
		]);
		expect(recorded.materialized).toEqual([
			{ workspaceId: "cloud-ws", fileIds: ["file-1"] },
		]);
	});

	it("names a nameless blob from its mime type and defaults the content type", async () => {
		const { deps, recorded } = makeDeps();
		await sendAttachmentsToWorkspace({
			deps,
			workspaceId: "ws-1",
			isCloudWorkspace: false,
			files: [
				new File([new Uint8Array(2)], "", { type: "image/jpeg" }),
				new File([new Uint8Array(2)], "", { type: "" }),
			],
		});
		expect(recorded.uploads).toEqual([
			{ name: "attachment_1.jpg", contentType: "image/jpeg", sizeBytes: 2 },
			{
				name: "attachment_2",
				contentType: "application/octet-stream",
				sizeBytes: 2,
			},
		]);
	});

	it("fails before uploading anything when a file is over the limit", async () => {
		const { deps, recorded } = makeDeps();
		const big = {
			name: "huge.png",
			type: "image/png",
			size: MAX_ATTACHMENT_BYTES + 1,
		} as File;
		await expect(
			sendAttachmentsToWorkspace({
				deps,
				workspaceId: "ws-1",
				isCloudWorkspace: false,
				files: [png("ok.png"), big],
			}),
		).rejects.toBeInstanceOf(AttachmentLimitError);
		expect(recorded.uploads).toEqual([]);
	});

	it("refuses more files than one send may carry", async () => {
		const { deps, recorded } = makeDeps();
		const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) =>
			png(`${i}.png`),
		);
		await expect(
			sendAttachmentsToWorkspace({
				deps,
				workspaceId: "ws-1",
				isCloudWorkspace: false,
				files,
			}),
		).rejects.toBeInstanceOf(AttachmentLimitError);
		expect(recorded.uploads).toEqual([]);
	});

	it("surfaces a rejected PUT and never materializes", async () => {
		const { deps, recorded } = makeDeps({ putStatus: 403 });
		await expect(
			sendAttachmentsToWorkspace({
				deps,
				workspaceId: "ws-1",
				isCloudWorkspace: false,
				files: [png("a.png")],
			}),
		).rejects.toThrow("Upload failed for a.png (403)");
		expect(recorded.materialized).toEqual([]);
	});

	it("does nothing for an empty list", async () => {
		const { deps, recorded } = makeDeps();
		expect(
			await sendAttachmentsToWorkspace({
				deps,
				workspaceId: "ws-1",
				isCloudWorkspace: true,
				files: [],
			}),
		).toEqual([]);
		expect(recorded.uploads).toEqual([]);
		expect(recorded.attached).toEqual([]);
	});
	it("keeps a same-machine send off storage: paths are copied, blobs written, order kept", async () => {
		const { deps, recorded } = makeDeps();
		const dmg = new File([new Uint8Array(1)], "build.dmg");
		Object.defineProperty(dmg, "size", { value: MAX_ATTACHMENT_BYTES * 2 });
		const notes = new File(["n"], "notes.txt");
		const diskPaths = new Map([
			[dmg, "/Users/me/build.dmg"],
			[notes, "/Users/me/notes.txt"],
		]);
		const written: LocalAttachmentItem[][] = [];

		const paths = await sendAttachmentsToWorkspace({
			deps: {
				...deps,
				sameMachine: {
					pathOf: (file) => diskPaths.get(file) ?? "",
					readBase64: async () => "cG5n",
					async write(items) {
						written.push(items);
						return items.map((_, i) => `.superset/attachments/${i}`);
					},
				},
			},
			workspaceId: "ws-1",
			isCloudWorkspace: false,
			files: [dmg, png("shot.png"), notes],
		});

		expect(written).toEqual([
			[
				{ kind: "path", sourcePath: "/Users/me/build.dmg" },
				{ kind: "base64", name: "shot.png", data: "cG5n" },
				{ kind: "path", sourcePath: "/Users/me/notes.txt" },
			],
		]);
		expect(paths).toEqual([
			".superset/attachments/0",
			".superset/attachments/1",
			".superset/attachments/2",
		]);
		expect(recorded.uploads).toEqual([]);
		expect(recorded.materialized).toEqual([]);
	});

	it("caps same-machine blobs, since their bytes cross IPC", async () => {
		const { deps } = makeDeps();
		const big = png("huge.png");
		Object.defineProperty(big, "size", { value: MAX_ATTACHMENT_BYTES + 1 });

		await expect(
			sendAttachmentsToWorkspace({
				deps: {
					...deps,
					sameMachine: {
						pathOf: () => "",
						readBase64: async () => "",
						write: async () => [],
					},
				},
				workspaceId: "ws-1",
				isCloudWorkspace: false,
				files: [big],
			}),
		).rejects.toThrow(AttachmentLimitError);
	});

	it("throws when the host returns a different number of paths than files", async () => {
		const { deps } = makeDeps();

		await expect(
			sendAttachmentsToWorkspace({
				deps: { ...deps, materialize: async () => ({ paths: [] }) },
				workspaceId: "ws-1",
				isCloudWorkspace: false,
				files: [png("a.png")],
			}),
		).rejects.toThrow("Expected 1 attachment paths, got 0");
	});
});
