import { ownedByGroup } from "../devs/devs.ts";
import type { Dev } from "../model/model.ts";

/** One entry of a folder in a Dev's `/agent`, as the API lists it. */
export interface FolderEntry {
	name: string;
	kind: "folder" | "file";
	size: number;
	modifiedAt: string;
}

/** A place in the folder, relative to `/agent` ("" is the root), and the crumbs that lead to it, root first. */
export function folderCrumbs(path: string): { name: string; path: string }[] {
	const parts = path.split("/").filter(Boolean);
	return parts.map((name, i) => ({
		name,
		path: parts.slice(0, i + 1).join("/"),
	}));
}

export const parentFolder = (path: string) =>
	path.split("/").filter(Boolean).slice(0, -1).join("/");

export const childPath = (folder: string, name: string) =>
	folder ? `${folder}/${name}` : name;

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg"]);
/** Types the app hands to the system rather than trying to read as text. */
const OPAQUE_EXTENSIONS = new Set([
	"pdf",
	"zip",
	"gz",
	"tar",
	"tgz",
	"mp3",
	"m4a",
	"wav",
	"mp4",
	"mov",
	"webm",
	"docx",
	"xlsx",
	"pptx",
	"wasm",
	"sqlite",
	"db",
]);

/** How a file opens in the app: as a picture, as text (a binary one is found out once it's read), or not at all. */
export function folderPreviewKind(name: string): "image" | "text" | null {
	const ext = name.includes(".")
		? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
		: "";
	if (IMAGE_EXTENSIONS.has(ext)) return "image";
	return OPAQUE_EXTENSIONS.has(ext) ? null : "text";
}

/** Whether bytes are binary (a NUL in the first 8 KB), so they're offered for saving rather than shown as garbage. */
export function looksBinary(bytes: Uint8Array): boolean {
	return bytes.subarray(0, 8192).includes(0);
}

const MIME_BY_IMAGE: Record<string, string> = {
	png: "image/png",
	jpg: "image/jpeg",
	jpeg: "image/jpeg",
	gif: "image/gif",
	webp: "image/webp",
	svg: "image/svg+xml",
};

/** The type a picture is shown as (bytes come back untyped). */
export function imageMime(name: string): string {
	return (
		MIME_BY_IMAGE[name.slice(name.lastIndexOf(".") + 1).toLowerCase()] ??
		"application/octet-stream"
	);
}

/**
 * Whether `meId` may open the Dev's folder (the API's rule): their own Dev, or one that belongs to a group (its
 * own, or one added to it). A person's Dev let into a group keeps its folder to its owner, since it holds their
 * memory and their 1:1 sessions.
 */
export const canOpenFolder = (
	dev: Pick<Dev, "kind" | "ownerId">,
	meId: string,
): boolean => dev.ownerId === meId || ownedByGroup(dev);
