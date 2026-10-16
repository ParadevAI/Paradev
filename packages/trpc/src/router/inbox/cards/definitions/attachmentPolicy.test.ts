import { describe, expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { blockedArchive, blockedByName } from "./attachmentPolicy";

/** A stored (uncompressed) zip with these entry names; `encrypted` sets the flag bit Gmail reads. */
function zip(entries: { name: string; encrypted?: boolean }[]): Uint8Array {
	const central: number[] = [];
	for (const { name, encrypted } of entries) {
		const bytes = [...new TextEncoder().encode(name)];
		const header = new Uint8Array(46);
		const view = new DataView(header.buffer);
		view.setUint32(0, 0x02014b50, true);
		view.setUint16(8, encrypted ? 1 : 0, true);
		view.setUint16(28, bytes.length, true);
		central.push(...header, ...bytes);
	}
	const end = new Uint8Array(22);
	const view = new DataView(end.buffer);
	view.setUint32(0, 0x06054b50, true);
	view.setUint16(10, entries.length, true);
	view.setUint32(16, 0, true);
	return new Uint8Array([...central, ...end]);
}

function tar(names: string[]): Uint8Array {
	const blocks: number[] = [];
	for (const name of names) {
		const header = new Uint8Array(512);
		header.set(new TextEncoder().encode(name), 0);
		header.set(new TextEncoder().encode("00000000000"), 124);
		header.set(new TextEncoder().encode("ustar"), 257);
		blocks.push(...header);
	}
	return new Uint8Array([...blocks, ...new Uint8Array(1024)]);
}

describe("blockedByName", () => {
	test("Gmail's listed extensions, also gzip- or bzip2-compressed, in any case", () => {
		for (const name of [
			"setup.exe",
			"RUN.BAT",
			"tool.js",
			"app.dmg",
			"notes.exe.gz",
			"x.vbs.bz2",
		]) {
			expect(blockedByName(name)).toBe(true);
		}
		for (const name of [
			"report.pdf",
			"photos.zip",
			"data.json",
			"exe",
			"archive.tar.gz",
		]) {
			expect(blockedByName(name)).toBe(false);
		}
	});
});

describe("blockedArchive", () => {
	test("an archive holding a listed file or a password-protected archive is blocked", () => {
		expect(
			blockedArchive(
				zip([{ name: "readme.txt" }, { name: "bin/setup.exe" }]),
				"tools.zip",
			),
		).toBe(true);
		expect(
			blockedArchive(
				zip([{ name: "inner.zip", encrypted: true }]),
				"wrapped.zip",
			),
		).toBe(true);
		expect(
			blockedArchive(gzipSync(tar(["scripts/install.bat"])), "kit.tgz"),
		).toBe(true);
	});

	test("a clean archive passes; one that cannot be read does not", () => {
		expect(
			blockedArchive(
				zip([{ name: "lodge.jpg" }, { name: "dock.jpg", encrypted: true }]),
				"photos.zip",
			),
		).toBe(false);
		expect(
			blockedArchive(gzipSync(tar(["photos/lodge.jpg"])), "photos.tar.gz"),
		).toBe(false);
		expect(blockedArchive(new Uint8Array(4096).fill(7), "photos.zip")).toBe(
			true,
		);
	});
});
