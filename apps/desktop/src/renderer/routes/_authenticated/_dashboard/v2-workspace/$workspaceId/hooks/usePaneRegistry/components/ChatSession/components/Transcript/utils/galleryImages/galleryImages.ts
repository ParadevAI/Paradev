import { transcriptItemKey, userMessageText } from "@superset/chat/core";
import type {
	AgentMessage,
	Item,
	ToolCall,
	UserContent,
	UserMessage,
} from "@superset/chat/protocol";
import { isImageAttachment } from "@superset/chat/protocol";
import { parseAttachmentTags } from "../../../../utils/attachmentTags";
import type { TranscriptRow } from "../transcriptRows";

export type GalleryImage = {
	id: string;
	/** Relative to the worktree, as the item names it. */
	path: string;
	mimeType: string;
	filename: string;
	alt?: string | undefined;
};

type ItemImage = { path: string; mimeType: string; alt?: string | undefined };

/** `owner` is the transcript key of the item that shows the image. */
export function galleryImageId(owner: string, path: string): string {
	return JSON.stringify([owner, path]);
}

function userImages(content: readonly UserContent[]): ItemImage[] {
	return parseAttachmentTags(userMessageText({ content }))
		.attachments.filter((attachment) => attachment.type.startsWith("image/"))
		.map((attachment) => ({
			path: attachment.path,
			mimeType: attachment.type,
		}));
}

function itemImages(item: Item): ItemImage[] {
	switch (item.kind) {
		case "user_message":
			return userImages((item as UserMessage).content);
		case "agent_message":
		case "tool_call":
			return ((item as AgentMessage | ToolCall).attachments ?? [])
				.filter(isImageAttachment)
				.map((image) => ({
					path: image.path,
					mimeType: image.mimeType,
					alt: image.alt,
				}));
		default:
			return [];
	}
}

function rowItems(row: TranscriptRow): Item[] {
	switch (row.kind) {
		case "item":
			return [row.item];
		case "tool_run":
			return row.items;
		case "outbox":
			return [
				{
					id: row.entry.clientId,
					kind: "user_message",
					clientId: row.entry.clientId,
					startedAtMs: 0,
					content: row.entry.content,
				} satisfies UserMessage,
			];
		default:
			return [];
	}
}

/**
 * Every image the transcript shows, in reading order. A row shows each path
 * once, so a run that reads the same file twice contributes one entry, owned
 * by the first call that carried it.
 */
export function galleryImages(rows: readonly TranscriptRow[]): GalleryImage[] {
	const images: GalleryImage[] = [];
	for (const row of rows) {
		const seen = new Set<string>();
		for (const item of rowItems(row)) {
			const owner = transcriptItemKey(item);
			for (const image of itemImages(item)) {
				if (seen.has(image.path)) continue;
				seen.add(image.path);
				images.push({
					id: galleryImageId(owner, image.path),
					path: image.path,
					mimeType: image.mimeType,
					filename: image.path.split("/").pop() ?? image.path,
					alt: image.alt,
				});
			}
		}
	}
	return images;
}
