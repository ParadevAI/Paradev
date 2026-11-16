import { describe, expect, test } from "bun:test";
import type { ChatState } from "../chat-state/chat-state.ts";
import type { SharedFile } from "../model/model.ts";
import {
	acceptFiles,
	fileKind,
	fileMeta,
	fileSharer,
	fileTitle,
	fileTypeFor,
	formatFileSize,
	isPlainFileName,
	isTextKind,
	MAX_FILES_AT_ONCE,
	MAX_SHARED_FILE_BYTES,
	markdownPreview,
	previewRows,
	shareFileProblem,
	textPreview,
	toHex,
} from "./shared-files.ts";

const file = (fields: Partial<SharedFile> = {}): SharedFile => ({
	id: "f1",
	chatId: "g",
	name: "plan.pdf",
	title: "",
	mime: "application/pdf",
	size: 1_234_567,
	sharedBy: { kind: "dev", id: "wren" },
	preview: "",
	createdAt: "2026-10-13T09:00:00.000Z",
	...fields,
});

const state: ChatState = {
	meId: "u1",
	members: {
		u1: { id: "u1", name: "Harshith" },
		u2: { id: "u2", name: "Priya" },
	},
	devs: {
		wren: {
			id: "wren",
			kind: "group",
			name: "Wren",
			color: "#2F6F6A",
			ownerId: null,
			description: "",
		},
	},
	chats: [],
	messages: [],
	tasks: [],
	apps: [],
};

describe("shared file types", () => {
	test("the type comes from the extension, any case; what a browser would run isn't shareable", () => {
		expect(fileTypeFor("Itinerary.PDF")).toEqual({
			mime: "application/pdf",
			kind: "pdf",
		});
		expect(fileTypeFor("budget.csv")).toEqual({
			mime: "text/csv",
			kind: "table",
		});
		expect(fileTypeFor("notes.md")?.kind).toBe("markdown");
		expect(fileTypeFor("photo.jpeg")?.mime).toBe("image/jpeg");
		for (const name of [
			"page.html",
			"logo.svg",
			"run.sh",
			"README",
			".env",
			"app.js",
		])
			expect(fileTypeFor(name)).toBeNull();
	});

	test("a stored file's kind is read from its type, falling back to its name", () => {
		expect(fileKind(file())).toBe("pdf");
		expect(
			fileKind(file({ mime: "application/x-unknown", name: "a.zip" })),
		).toBe("archive");
		expect(
			fileKind(file({ mime: "application/x-unknown", name: "a.bin" })),
		).toBeNull();
		expect(isTextKind("table")).toBe(true);
		expect(isTextKind("pdf")).toBe(false);
	});
});

describe("file cards", () => {
	test("sizes read like Finder's", () => {
		expect(formatFileSize(812)).toBe("812 B");
		expect(formatFileSize(1_000)).toBe("1 KB");
		expect(formatFileSize(14_300)).toBe("14 KB");
		expect(formatFileSize(1_234_567)).toBe("1.2 MB");
		expect(formatFileSize(25 * 1024 * 1024)).toBe("26 MB");
	});

	test("the meta line, the title and who shared it", () => {
		expect(fileMeta(file())).toBe("PDF · 1.2 MB");
		expect(fileTitle(file())).toBe("plan.pdf");
		expect(fileTitle(file({ title: "Lisbon itinerary" }))).toBe(
			"Lisbon itinerary",
		);
		expect(fileSharer(state, file())).toBe("Wren");
		expect(
			fileSharer(state, file({ sharedBy: { kind: "user", id: "u1" } })),
		).toBe("You");
		expect(
			fileSharer(state, file({ sharedBy: { kind: "user", id: "u2" } })),
		).toBe("Priya");
		expect(fileSharer(state, file({ sharedBy: null }))).toBeNull();
	});

	test("a text preview keeps the first lines, without a BOM, CRs or trailing blanks", () => {
		expect(
			textPreview("﻿# Lisbon\r\n\r\nDay 1\r\nDay 2\n\n\n", { lines: 4 }),
		).toBe("# Lisbon\n\nDay 1\nDay 2");
		expect(textPreview("x".repeat(1000), { chars: 10 })).toBe("x".repeat(10));
	});

	test("a markdown preview reads as text: headings' words, bullets, no emphasis marks", () => {
		expect(
			markdownPreview(
				"# Porto weekend\n\n## Saturday\n- 08:39 **Alfa** train\n  * [x] `booked`",
			),
		).toBe("Porto weekend\n\nSaturday\n• 08:39 Alfa train\n  • booked");
	});

	test("a CSV preview splits into cells, quoted commas kept, at most four columns", () => {
		const csv = file({
			mime: "text/csv",
			preview:
				'Item,Cost,Who,Paid,Note\n"Hotel, 3 nights",420,Leo,yes,x\n\nTrain,18,Sam,no,',
		});
		expect(previewRows(csv)).toEqual([
			["Item", "Cost", "Who", "Paid"],
			["Hotel, 3 nights", "420", "Leo", "yes"],
			["Train", "18", "Sam", "no"],
		]);
		expect(
			previewRows(
				file({
					mime: "text/tab-separated-values",
					preview: 'a\tb\n"say ""hi"""\tc',
				}),
			),
		).toEqual([
			["a", "b"],
			['say "hi"', "c"],
		]);
	});
});

describe("what may be shared", () => {
	test("a plain name of an allowed type, from 1 byte to 25 MB", () => {
		expect(shareFileProblem("Trip plan.pdf", 1_234)).toBeNull();
		expect(shareFileProblem("photo.JPG", MAX_SHARED_FILE_BYTES)).toBeNull();
		expect(
			shareFileProblem("photo.jpg", MAX_SHARED_FILE_BYTES + 1),
		).not.toBeNull();
		expect(shareFileProblem("empty.txt", 0)).not.toBeNull();
		expect(shareFileProblem("page.html", 10)).not.toBeNull();
		expect(shareFileProblem("drawing.svg", 10)).not.toBeNull();
		expect(shareFileProblem("README", 10)).not.toBeNull();
	});

	test("a name is a file's own name: no folders, no hidden files, no control characters", () => {
		expect(isPlainFileName("Budget (final).csv")).toBe(true);
		expect(isPlainFileName("../notes.md")).toBe(false);
		expect(isPlainFileName("a\\b.md")).toBe(false);
		expect(isPlainFileName(".env.txt")).toBe(false);
		expect(isPlainFileName("line\nbreak.txt")).toBe(false);
		expect(isPlainFileName("   ")).toBe(false);
		expect(isPlainFileName(`${"a".repeat(198)}.md`)).toBe(false);
		expect(shareFileProblem("../notes.md", 10)).not.toBeNull();
	});

	test("says which rule a file breaks", () => {
		expect(shareFileProblem("trip.pdf", MAX_SHARED_FILE_BYTES)).toBeNull();
		expect(shareFileProblem(".env", 10)).toBe(
			`".env" can't be shared: rename it and try again.`,
		);
		expect(shareFileProblem("page.html", 10)).toBe(
			"Files like page.html can't be shared in a chat.",
		);
		expect(shareFileProblem("empty.txt", 0)).toBe("empty.txt is empty.");
		expect(shareFileProblem("big.mov", MAX_SHARED_FILE_BYTES + 1)).toBe(
			"big.mov is too big: files up to 25 MB can be shared.",
		);
	});
});

test("toHex writes a digest as lowercase hex", async () => {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode("abc"),
	);
	expect(toHex(digest)).toBe(
		"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
	);
	expect(toHex(new Uint8Array([0, 15, 255]))).toBe("000fff");
});

describe("picking several files", () => {
	const png = (name: string) => ({ name, size: 10 });

	test("keeps what's already there and adds the rest, in order", () => {
		expect(acceptFiles([png("a.png")], [png("b.png"), png("c.png")])).toEqual({
			files: [png("a.png"), png("b.png"), png("c.png")],
			problem: null,
		});
	});

	test("one that can't be shared leaves the others, and names itself", () => {
		const { files, problem } = acceptFiles(
			[],
			[png("a.png"), png("page.html")],
		);
		expect(files).toEqual([png("a.png")]);
		expect(problem?.startsWith("page.html: ")).toBe(true);
	});

	test("a lone refusal just says why", () => {
		const { files, problem } = acceptFiles([], [png("page.html")]);
		expect(files).toEqual([]);
		expect(problem?.startsWith("page.html")).toBe(false);
	});

	test("stops at the limit, and says so", () => {
		const many = Array.from({ length: MAX_FILES_AT_ONCE + 2 }, (_, i) =>
			png(`${i}.png`),
		);
		const { files, problem } = acceptFiles([], many);
		expect(files).toHaveLength(MAX_FILES_AT_ONCE);
		expect(problem).toContain(`${MAX_FILES_AT_ONCE} files`);
	});
});
