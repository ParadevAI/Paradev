import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBootStamps, recordBootStamp } from "./boot-stamps";

describe("recordBootStamp", () => {
	let dir: string;
	const previous = process.env.SUPERSET_SANDBOX_BOOT_LOG;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "boot-stamps-"));
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		if (previous === undefined) delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
		else process.env.SUPERSET_SANDBOX_BOOT_LOG = previous;
	});

	it("appends to the boot log the script started and reads it back", () => {
		const path = join(dir, "boot.log");
		process.env.SUPERSET_SANDBOX_BOOT_LOG = path;
		recordBootStamp("boot.start", 1789000000000);
		recordBootStamp("host.listening", 1789000004321);
		expect(readFileSync(path, "utf8")).toBe(
			"1789000000000 boot.start\n1789000004321 host.listening\n",
		);
		expect(readBootStamps()).toEqual([
			{ phase: "boot.start", at: 1789000000000 },
			{ phase: "host.listening", at: 1789000004321 },
		]);
	});

	it("records nothing without a boot log", () => {
		delete process.env.SUPERSET_SANDBOX_BOOT_LOG;
		recordBootStamp("host.listening");
		expect(readBootStamps()).toEqual([]);
	});
});
