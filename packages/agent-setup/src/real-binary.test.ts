import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isRealBinaryOnPath } from "./real-binary";

const ORIGINAL_HOME = process.env.HOME;
const ORIGINAL_SUPERSET_HOME_DIR = process.env.SUPERSET_HOME_DIR;
let root: string;

function writeExecutable(dir: string, name: string, mode = 0o755): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, name), "#!/bin/sh\n", { mode });
}

beforeEach(() => {
	root = fs.mkdtempSync(path.join(os.tmpdir(), "real-binary-"));
	process.env.HOME = path.join(root, "home");
	process.env.SUPERSET_HOME_DIR = path.join(root, "app-home");
});

afterEach(() => {
	if (ORIGINAL_HOME === undefined) delete process.env.HOME;
	else process.env.HOME = ORIGINAL_HOME;
	if (ORIGINAL_SUPERSET_HOME_DIR === undefined)
		delete process.env.SUPERSET_HOME_DIR;
	else process.env.SUPERSET_HOME_DIR = ORIGINAL_SUPERSET_HOME_DIR;
	fs.rmSync(root, { recursive: true, force: true });
});

describe("isRealBinaryOnPath", () => {
	it("finds an executable in a PATH directory", () => {
		const bin = path.join(root, "usr-bin");
		writeExecutable(bin, "devin");

		expect(isRealBinaryOnPath(["devin"], `/nonexistent:${bin}`)).toBe(true);
		expect(isRealBinaryOnPath(["claude"], bin)).toBe(false);
	});

	it("ignores Paradev wrapper directories and non-executable files", () => {
		const appBin = path.join(root, "app-home", "bin");
		const legacyBin = path.join(root, "home", ".superset", "bin");
		const plain = path.join(root, "plain");
		writeExecutable(appBin, "devin");
		writeExecutable(`${legacyBin}/`, "devin");
		writeExecutable(plain, "devin", 0o644);

		expect(
			isRealBinaryOnPath(["devin"], [appBin, `${legacyBin}/`, plain].join(":")),
		).toBe(false);
	});
});
