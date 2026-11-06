import { describe, expect, it } from "bun:test";
import {
	MAX_ATTACHMENT_BYTES,
	MAX_ATTACHMENTS,
	MAX_INLINE_ATTACHMENT_BYTES,
} from "@superset/shared/attachment-limits";
import {
	WORKSPACE_ATTACHMENTS_DIR,
	WORKSPACE_ATTACHMENTS_GITIGNORE,
} from "@superset/shared/workspace-attachments";
import {
	AttachmentLimitError,
	type AttachmentPart,
	AttachmentSourceError,
	type LocalAttachmentItem,
	type SendAttachmentsDeps,
	sendAttachments,
	sendAttachmentsToWorkspace,
} from "./sendAttachmentsToWorkspace";

interface Recorded {
	uploads: Array<{ name: string; contentType: string; sizeBytes: number }>;
	puts: Array<{ url: string; file: File }>;
	attached: Array<{ id: string; fileIds: string[] }>;
	materialized: Array<{ workspaceId: string; fileIds: string[] }>;
	hostUploads: Array<{ mediaType: string; originalFilename: string }>;
	writes: Array<{ absolutePath: string; content: unknown }>;
}

const DIR = `/repo/${WORKSPACE_ATTACHMENTS_DIR}`;

function makeDeps(
	options: { putStatus?: number; existing?: Set<string> } = {},
) {
	const recorded: Recorded = {
		uploads: [],
		puts: [],
		attached: [],
		materialized: [],
		hostUploads: [],
		writes: [],
	};
	let nextId = 0;
	const existing = options.existing ?? new Set<string>();
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
				paths: input.fileIds.map(
					(id) => `${WORKSPACE_ATTACHMENTS_DIR}/${id}.png`,
				),
			};
		},
		async hostUpload(input) {
			recorded.hostUploads.push({
				mediaType: input.mediaType,
				originalFilename: input.originalFilename,
			});
			nextId += 1;
			return {
				attachmentId: `host-${nextId}`,
				mediaType: input.mediaType,
				sizeBytes: 4,
			};
		},
		async worktreePath() {
			return "/repo";
		},
		async createDirectory() {},
		async writeFile(input) {
			if (existing.has(input.absolutePath))
				return { ok: false, reason: "exists" };
			existing.add(input.absolutePath);
			recorded.writes.push({
				absolutePath: input.absolutePath,
				content: input.content,
			});
			return { ok: true };
		},
	};
	return { deps, recorded };
}

const png = (name: string, size = 4) =>
	new File([new Uint8Array(size)], name, { type: "image/png" });

const sized = (name: string, size: number) =>
	({ name, type: "image/png", size }) as File;

describe("sendAttachments", () => {
	it("a cloud workspace's parts are storage objects, anchored to it, named by fileId alone", async () => {
		const { deps, recorded } = makeDeps();
		const parts = await sendAttachments({
			deps,
			route: "cloud",
			workspaceId: "cloud-ws",
			files: [png("a.png"), png("b.png", 9)],
		});

		expect(parts).toEqual([
			{
				type: "attachment",
				fileId: "file-1",
				name: "a.png",
				mimeType: "image/png",
				sizeBytes: 4,
			},
			{
				type: "attachment",
				fileId: "file-2",
				name: "b.png",
				mimeType: "image/png",
				sizeBytes: 9,
			},
		]);
		expect(recorded.attached).toEqual([
			{ id: "cloud-ws", fileIds: ["file-1", "file-2"] },
		]);
		expect(recorded.hostUploads).toEqual([]);
		expect(recorded.materialized).toEqual([]);
	});

	it("a host workspace's parts go to the host store and never to storage", async () => {
		const { deps, recorded } = makeDeps();
		const parts = await sendAttachments({
			deps,
			route: "remote",
			workspaceId: "ws-1",
			files: [png("a.png")],
		});

		expect(parts).toEqual([
			{
				type: "attachment",
				attachmentId: "host-1",
				name: "a.png",
				mimeType: "image/png",
				sizeBytes: 4,
			},
		]);
		expect(recorded.hostUploads).toEqual([
			{ mediaType: "image/png", originalFilename: "a.png" },
		]);
		expect(recorded.uploads).toEqual([]);
		expect(recorded.attached).toEqual([]);
	});

	it("refuses a host workspace a file over the inline cap, before sending anything", async () => {
		const { deps, recorded } = makeDeps();
		await expect(
			sendAttachments({
				deps,
				route: "same-machine",
				workspaceId: "ws-1",
				files: [
					png("ok.png"),
					sized("big.png", MAX_INLINE_ATTACHMENT_BYTES + 1),
				],
			}),
		).rejects.toBeInstanceOf(AttachmentLimitError);
		expect(recorded.hostUploads).toEqual([]);
	});

	it("hands each part and the file it came from to the caller, for the sent row", async () => {
		const { deps } = makeDeps();
		const file = png("a.png");
		const sent: Array<[AttachmentPart, File]> = [];
		await sendAttachments({
			deps,
			route: "cloud",
			workspaceId: "cloud-ws",
			files: [file],
			onSent: (part, from) => sent.push([part, from]),
		});
		expect(sent.map(([part, from]) => [part.fileId, from])).toEqual([
			["file-1", file],
		]);
	});

	it("names a nameless blob from its mime type and defaults the content type", async () => {
		const { deps, recorded } = makeDeps();
		await sendAttachments({
			deps,
			route: "cloud",
			workspaceId: "cloud-ws",
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

	it("refuses more files than one send may carry", async () => {
		const { deps, recorded } = makeDeps();
		const files = Array.from({ length: MAX_ATTACHMENTS + 1 }, (_, i) =>
			png(`${i}.png`),
		);
		await expect(
			sendAttachments({ deps, route: "cloud", workspaceId: "ws", files }),
		).rejects.toBeInstanceOf(AttachmentLimitError);
		expect(recorded.uploads).toEqual([]);
	});

	it("surfaces a rejected PUT and never anchors the files", async () => {
		const { deps, recorded } = makeDeps({ putStatus: 403 });
		await expect(
			sendAttachments({
				deps,
				route: "cloud",
				workspaceId: "ws",
				files: [png("a.png")],
			}),
		).rejects.toThrow("Upload failed for a.png (403)");
		expect(recorded.attached).toEqual([]);
	});
});

describe("sendAttachmentsToWorkspace", () => {
	it("a box gets paths through storage: upload, anchor, then materialize", async () => {
		const { deps, recorded } = makeDeps();
		const paths = await sendAttachmentsToWorkspace({
			deps,
			route: "cloud",
			workspaceId: "cloud-ws",
			files: [png("shot.png")],
		});
		expect(recorded.attached).toEqual([
			{ id: "cloud-ws", fileIds: ["file-1"] },
		]);
		expect(recorded.materialized).toEqual([
			{ workspaceId: "cloud-ws", fileIds: ["file-1"] },
		]);
		expect(recorded.writes).toEqual([]);
		expect(paths).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/file-1.png`]);
	});

	it("a relay-reached host gets the bytes written into its worktree, and storage is never called", async () => {
		const { deps, recorded } = makeDeps();
		const paths = await sendAttachmentsToWorkspace({
			deps,
			route: "remote",
			workspaceId: "ws-1",
			files: [png("shot.png")],
		});
		expect(recorded.uploads).toEqual([]);
		expect(recorded.writes).toEqual([
			{
				absolutePath: `${DIR}/.gitignore`,
				content: WORKSPACE_ATTACHMENTS_GITIGNORE,
			},
			{
				absolutePath: `${DIR}/shot.png`,
				content: { kind: "base64", data: "AAAAAA==" },
			},
		]);
		expect(paths).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/shot.png`]);
	});

	it("never overwrites a path an earlier paste already wrote", async () => {
		const { deps } = makeDeps({ existing: new Set([`${DIR}/shot.png`]) });
		expect(
			await sendAttachmentsToWorkspace({
				deps,
				route: "remote",
				workspaceId: "ws-1",
				files: [png("shot.png")],
			}),
		).toEqual([`${WORKSPACE_ATTACHMENTS_DIR}/shot_1.png`]);
	});

	it("refuses a relay-reached host a file over the inline cap", async () => {
		const { deps, recorded } = makeDeps();
		await expect(
			sendAttachmentsToWorkspace({
				deps,
				route: "remote",
				workspaceId: "ws-1",
				files: [sized("big.png", MAX_INLINE_ATTACHMENT_BYTES + 1)],
			}),
		).rejects.toBeInstanceOf(AttachmentLimitError);
		expect(recorded.writes).toEqual([]);
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
						return {
							ok: true,
							paths: items.map((_, i) => `${WORKSPACE_ATTACHMENTS_DIR}/${i}`),
						};
					},
				},
			},
			route: "same-machine",
			workspaceId: "ws-1",
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
			`${WORKSPACE_ATTACHMENTS_DIR}/0`,
			`${WORKSPACE_ATTACHMENTS_DIR}/1`,
			`${WORKSPACE_ATTACHMENTS_DIR}/2`,
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
						write: async () => ({ ok: true, paths: [] }),
					},
				},
				route: "same-machine",
				workspaceId: "ws-1",
				files: [big],
			}),
		).rejects.toThrow(AttachmentLimitError);
	});

	it("throws when the host returns a different number of paths than files", async () => {
		const { deps } = makeDeps();

		await expect(
			sendAttachmentsToWorkspace({
				deps: { ...deps, materialize: async () => ({ paths: [] }) },
				route: "cloud",
				workspaceId: "ws-1",
				files: [png("a.png")],
			}),
		).rejects.toThrow("Expected 1 attachment paths, got 0");
	});

	it("names the file this machine could not read, so the composer can say which", async () => {
		const { deps } = makeDeps();

		const error = await sendAttachmentsToWorkspace({
			deps: {
				...deps,
				sameMachine: {
					pathOf: (file) => `/Users/me/${file.name}`,
					readBase64: async () => "",
					write: async () => ({ ok: false, index: 1, problem: "missing" }),
				},
			},
			route: "same-machine",
			workspaceId: "ws-1",
			files: [png("a.png"), png("moved.png")],
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(AttachmentSourceError);
		expect(error).toMatchObject({
			index: 1,
			fileName: "moved.png",
			problem: "missing",
		});
	});

	it("does nothing for an empty list", async () => {
		const { deps, recorded } = makeDeps();
		expect(
			await sendAttachmentsToWorkspace({
				deps,
				route: "cloud",
				workspaceId: "ws-1",
				files: [],
			}),
		).toEqual([]);
		expect(recorded.uploads).toEqual([]);
	});
});
