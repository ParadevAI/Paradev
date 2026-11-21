import { describe, expect, it } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	attachmentSourceKey,
	createCloudUrlResolver,
	primeAttachmentSource,
	readAttachmentSource,
} from "./attachmentSource";

const FILE_ID = "8c1f6f8e-3a2b-4c5d-9e0f-112233445566";

const part = (ids: { fileId?: string; attachmentId?: string }) => ({
	type: "attachment" as const,
	...ids,
	name: "shot.png",
	mimeType: "image/png",
	sizeBytes: 3,
});

const unexpected = async (): Promise<never> => {
	throw new Error("unexpected read");
};

describe("readAttachmentSource", () => {
	it("reads a cloud part from storage, never the host", async () => {
		const asked: string[] = [];
		const src = await readAttachmentSource(part({ fileId: FILE_ID }), {
			cloudUrl: async (fileId) => {
				asked.push(fileId);
				return "https://r2.test/shot";
			},
			fetchBlob: async () => new Blob([new Uint8Array([1, 2, 3])]),
			hostRead: unexpected,
		});
		expect(asked).toEqual([FILE_ID]);
		expect(src).toStartWith("data:");
	});

	it("reads a host part from the host, never storage", async () => {
		expect(
			await readAttachmentSource(part({ attachmentId: "a1" }), {
				cloudUrl: unexpected,
				fetchBlob: unexpected,
				hostRead: async () => ({ mediaType: "image/png", data: "AQID" }),
			}),
		).toBe("data:image/png;base64,AQID");
	});

	it("gives a badge for a cloud part storage no longer has", async () => {
		expect(
			await readAttachmentSource(part({ fileId: FILE_ID }), {
				cloudUrl: async () => null,
				fetchBlob: unexpected,
				hostRead: unexpected,
			}),
		).toBeNull();
	});
});

describe("primeAttachmentSource", () => {
	it("lets the sent row render the file it attached without any read", async () => {
		const queryClient = new QueryClient();
		const sent = part({ fileId: FILE_ID });
		await primeAttachmentSource(
			queryClient,
			sent,
			new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" }),
		);
		const src = await queryClient.fetchQuery({
			queryKey: attachmentSourceKey(sent),
			queryFn: unexpected,
			staleTime: Number.POSITIVE_INFINITY,
		});
		expect(src).toStartWith("data:image/png;base64,");
	});
});

describe("createCloudUrlResolver", () => {
	it("resolves the thumbnails asked for together in one call", async () => {
		const calls: string[][] = [];
		const resolve = createCloudUrlResolver(async (fileIds) => {
			calls.push(fileIds);
			return fileIds.map((fileId) =>
				fileId === "gone"
					? { fileId, missing: true as const }
					: { fileId, url: `https://r2.test/${fileId}` },
			);
		});
		const urls = await Promise.all([
			resolve("a"),
			resolve("b"),
			resolve("gone"),
		]);
		expect(calls).toEqual([["a", "b", "gone"]]);
		expect(urls).toEqual(["https://r2.test/a", "https://r2.test/b", null]);
	});
});
