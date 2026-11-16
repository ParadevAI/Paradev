import type { ChatState } from "../chat-state/chat-state.ts";
import type { SharedFile } from "../model/model.ts";

/** How a file's card draws it: its icon, and whether it previews as a picture or as lines of text. */
export type FileKind =
	| "image"
	| "pdf"
	| "text"
	| "markdown"
	| "table"
	| "archive"
	| "document"
	| "spreadsheet"
	| "presentation"
	| "audio"
	| "video";

export interface FileType {
	mime: string;
	kind: FileKind;
}

/**
 * What may be shared in a chat, by extension. The API takes the type from the name (never from the sender) and checks
 * the bytes agree, so nothing a browser would run (HTML, SVG, scripts) is ever served from the API's origin.
 */
const TYPES: Record<string, FileType> = {
	png: { mime: "image/png", kind: "image" },
	jpg: { mime: "image/jpeg", kind: "image" },
	jpeg: { mime: "image/jpeg", kind: "image" },
	gif: { mime: "image/gif", kind: "image" },
	webp: { mime: "image/webp", kind: "image" },
	heic: { mime: "image/heic", kind: "image" },
	pdf: { mime: "application/pdf", kind: "pdf" },
	txt: { mime: "text/plain", kind: "text" },
	log: { mime: "text/plain", kind: "text" },
	json: { mime: "application/json", kind: "text" },
	ics: { mime: "text/calendar", kind: "text" },
	md: { mime: "text/markdown", kind: "markdown" },
	markdown: { mime: "text/markdown", kind: "markdown" },
	csv: { mime: "text/csv", kind: "table" },
	tsv: { mime: "text/tab-separated-values", kind: "table" },
	zip: { mime: "application/zip", kind: "archive" },
	docx: {
		mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		kind: "document",
	},
	xlsx: {
		mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		kind: "spreadsheet",
	},
	pptx: {
		mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
		kind: "presentation",
	},
	mp3: { mime: "audio/mpeg", kind: "audio" },
	m4a: { mime: "audio/mp4", kind: "audio" },
	wav: { mime: "audio/wav", kind: "audio" },
	mp4: { mime: "video/mp4", kind: "video" },
	mov: { mime: "video/quicktime", kind: "video" },
};

/** The most a shared file may be: what an itinerary, a spreadsheet or a few photos zipped need. */
export const MAX_SHARED_FILE_BYTES = 25 * 1024 * 1024;

/**
 * Bytes per uploaded part: under the 4.5 MB a Vercel Function takes in one request, so a 25 MB file goes up in seven
 * requests rather than needing a store clients write to directly.
 */
export const FILE_PART_BYTES = 4 * 1024 * 1024;

/** Kinds whose first lines are the card's preview. */
const TEXT_KINDS: ReadonlySet<FileKind> = new Set([
	"text",
	"markdown",
	"table",
]);

const extension = (name: string) => {
	const dot = name.lastIndexOf(".");
	return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};

/** The type a file of this name is shared as, or null when it may not be shared. */
export function fileTypeFor(name: string): FileType | null {
	return TYPES[extension(name)] ?? null;
}

/** A plain file name: what a person would see in Files or Finder, never a path or a hidden file. */
export const isPlainFileName = (name: string) =>
	!!name.trim() &&
	name.length <= 200 &&
	// biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what a file name must not hold
	!/[/\\\u0000-\u001f]/.test(name) &&
	!name.startsWith(".");

/** Why a file may not be shared, by its name and size, as an app tells the person before uploading it; null when it may. */
export function shareFileProblem(name: string, size: number): string | null {
	if (!isPlainFileName(name))
		return `"${name}" can't be shared: rename it and try again.`;
	if (!fileTypeFor(name))
		return `Files like ${name} can't be shared in a chat.`;
	if (size < 1) return `${name} is empty.`;
	// Said in MiB: formatFileSize (powers of 1000) would write the cap as 26 MB.
	if (size > MAX_SHARED_FILE_BYTES)
		return `${name} is too big: files up to ${MAX_SHARED_FILE_BYTES / 1024 / 1024} MB can be shared.`;
	if (!Number.isInteger(size)) return `${name} can't be shared.`;
	return null;
}

/** Lowercase hex of a SHA-256 digest, as the API compares it. */
export const toHex = (bytes: ArrayBuffer | Uint8Array) =>
	Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), (b) =>
		b.toString(16).padStart(2, "0"),
	).join("");

/** Every extension that may be shared, for error messages. */
export const SHAREABLE_EXTENSIONS = Object.keys(TYPES);

/** How a card draws a file it got from the API: by its stored type, or by its name for a type it doesn't know. */
export function fileKind(
	file: Pick<SharedFile, "mime" | "name">,
): FileKind | null {
	return (
		Object.values(TYPES).find((t) => t.mime === file.mime)?.kind ??
		fileTypeFor(file.name)?.kind ??
		null
	);
}

export const isTextKind = (kind: FileKind | null) =>
	kind !== null && TEXT_KINDS.has(kind);

/** "812 B", "14 KB", "3.2 MB": as Finder and Files write sizes (powers of 1000). */
export function formatFileSize(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1000;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit++;
	}
	return `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)} ${units[unit]}`;
}

/** The first lines of a text file, for its card: at most `lines` lines and `chars` characters, trailing blanks dropped. */
export function textPreview(
	text: string,
	{ lines = 6, chars = 600 } = {},
): string {
	const head = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").slice(0, chars);
	return head.split("\n").slice(0, lines).join("\n").trimEnd();
}

/** A markdown preview as a card shows it: headings as their words, list items as bullets, emphasis marks gone. */
export function markdownPreview(preview: string): string {
	return preview
		.split("\n")
		.map((line) =>
			line
				.replace(/^\s{0,3}#{1,6}\s+/, "")
				.replace(/^(\s*)[-*+]\s+(\[[ xX]\]\s+)?/, "$1• ")
				.replace(/(\*\*|__|~~|`)(.+?)\1/g, "$2"),
		)
		.join("\n");
}

/** A CSV or TSV preview as rows of cells (quoted cells with commas kept whole), for the card's little table. */
export function previewRows(
	file: Pick<SharedFile, "preview" | "mime">,
	maxColumns = 4,
): string[][] {
	const separator = file.mime === "text/tab-separated-values" ? "\t" : ",";
	return file.preview
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => splitRow(line, separator).slice(0, maxColumns));
}

function splitRow(line: string, separator: string): string[] {
	const cells: string[] = [];
	let cell = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i]!;
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') {
				cell += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else cell += ch;
		} else if (ch === '"' && !cell) quoted = true;
		else if (ch === separator) {
			cells.push(cell.trim());
			cell = "";
		} else cell += ch;
	}
	cells.push(cell.trim());
	return cells;
}

/** What a file's card calls it: its title, else its name. */
export const fileTitle = (file: Pick<SharedFile, "title" | "name">) =>
	file.title || file.name;

/** Who shared a file, as its card says it: "You", a person's or a Dev's name. */
export function fileSharer(
	state: ChatState,
	file: Pick<SharedFile, "sharedBy">,
): string | null {
	const by = file.sharedBy;
	if (!by) return null;
	if (by.kind === "dev") return state.devs[by.id]?.name ?? null;
	return by.id === state.meId ? "You" : (state.members[by.id]?.name ?? null);
}

/** The card's line under the name: "PDF · 1.2 MB", "CSV · 3 KB". */
export function fileMeta(file: Pick<SharedFile, "name" | "size">): string {
	const ext = extension(file.name).toUpperCase();
	return [ext, formatFileSize(file.size)].filter(Boolean).join(" · ");
}

/** The most files one send takes: each is its own message, and a chat shouldn't fill with one slip of the picker. */
export const MAX_FILES_AT_ONCE = 10;

/**
 * What a send can take of what was picked, added to what's already on the draft: those that can be shared, up to the
 * limit, and a sentence about any that couldn't.
 */
export function acceptFiles<T extends { name: string; size: number }>(
	held: readonly T[],
	picked: readonly T[],
): { files: T[]; problem: string | null } {
	const files = [...held];
	let problem: string | null = null;
	for (const file of picked) {
		const refusal = shareFileProblem(file.name, file.size);
		if (refusal)
			problem = picked.length > 1 ? `${file.name}: ${refusal}` : refusal;
		else if (files.length >= MAX_FILES_AT_ONCE)
			problem = `You can send ${MAX_FILES_AT_ONCE} files at a time.`;
		else files.push(file);
	}
	return { files, problem };
}
