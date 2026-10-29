import { parsePastedText } from "@superset/chat/core";
import { WORKSPACE_ATTACHMENTS_DIR } from "@superset/shared/workspace-attachments";

export type AttachmentTag = { path: string; type: string; name?: string };

const TAG =
	/<attachment path="([^"]+)"(?: type="([^"]*)")?(?: name="([^"]*)")? \/>/g;
const SAFE_TYPE = /^[\w.+-]+\/[\w.+-]+$/;
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const MAX_NAME_LENGTH = 255;

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	'"': "&quot;",
	"<": "&lt;",
	">": "&gt;",
};
const UNESCAPES: Record<string, string> = {
	amp: "&",
	quot: '"',
	lt: "<",
	gt: ">",
};

function escapeAttribute(value: string): string {
	return value.replace(/[&"<>]/g, (char) => ESCAPES[char] ?? char);
}

function unescapeAttribute(value: string): string {
	return value.replace(
		/&(amp|quot|lt|gt);/g,
		(match, entity: string) => UNESCAPES[entity] ?? match,
	);
}

function baseName(path: string): string {
	return path.split("/").pop() ?? path;
}

function isWorkspaceAttachmentPath(path: string): boolean {
	const prefix = `${WORKSPACE_ATTACHMENTS_DIR}/`;
	if (!path.startsWith(prefix)) return false;
	const name = path.slice(prefix.length);
	return SAFE_NAME.test(name) && name !== "." && name !== "..";
}

/** The name the user attached; tags written before names were kept fall back to the file on disk. */
export function attachmentDisplayName(tag: AttachmentTag): string {
	return tag.name || baseName(tag.path);
}

export function formatAttachmentTag({ path, type, name }: AttachmentTag): string {
	const attributes = [`path="${path}"`];
	if (SAFE_TYPE.test(type)) attributes.push(`type="${type}"`);
	const cleanName = name
		?.replace(/\p{Cc}/gu, "")
		.trim()
		.slice(0, MAX_NAME_LENGTH);
	if (cleanName && cleanName !== baseName(path)) {
		attributes.push(`name="${escapeAttribute(cleanName)}"`);
	}
	return `<attachment ${attributes.join(" ")} />`;
}

export function parseAttachmentTags(message: string): {
	text: string;
	attachments: AttachmentTag[];
	pastedTexts: string[];
} {
	const { text, pastes } = parsePastedText(message);
	const attachments: AttachmentTag[] = [];
	const rest = text.replace(
		TAG,
		(match: string, path: string, type?: string, name?: string) => {
			if (!isWorkspaceAttachmentPath(path)) return match;
			attachments.push({
				path,
				type: type ?? "",
				...(name ? { name: unescapeAttribute(name) } : {}),
			});
			return "";
		},
	);
	return { text: rest.trim(), attachments, pastedTexts: pastes };
}
