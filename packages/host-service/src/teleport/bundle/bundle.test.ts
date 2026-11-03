import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { assertPlainEntries, gunzipBounded } from "./bundle";

describe("gunzipBounded", () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), "teleport-bundle-"));
	});
	afterEach(() => rmSync(root, { recursive: true, force: true }));

	test("unzips within the bound and fails past it", async () => {
		const archive = join(root, "a.gz");
		writeFileSync(archive, gzipSync(Buffer.alloc(10_000)));

		await gunzipBounded(archive, join(root, "ok.tar"), 10_000);
		expect(readFileSync(join(root, "ok.tar")).length).toBe(10_000);

		await expect(
			gunzipBounded(archive, join(root, "big.tar"), 1_000),
		).rejects.toThrow("too large");
	});

	test("unpacks only files and folders", async () => {
		const stage = join(root, "stage");
		mkdirSync(join(stage, "session"), { recursive: true });
		writeFileSync(join(stage, "session", "s.jsonl"), "{}");
		const plain = join(root, "plain.tar");
		execFileSync("tar", ["-cf", plain, "-C", stage, "."]);
		await assertPlainEntries(plain);

		symlinkSync(tmpdir(), join(stage, "session", "home"));
		const linked = join(root, "linked.tar");
		execFileSync("tar", ["-cf", linked, "-C", stage, "."]);
		await expect(assertPlainEntries(linked)).rejects.toThrow("will not unpack");
	});
});
