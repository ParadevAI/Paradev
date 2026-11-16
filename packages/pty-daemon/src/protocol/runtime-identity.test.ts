import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	readDaemonRuntimeIdentity,
	resolveCanonicalPath,
} from "./runtime-identity.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pty-daemon-id-"));
	tempDirs.push(dir);
	return dir;
}

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

describe("readDaemonRuntimeIdentity", () => {
	test("returns undefined when script path is missing or does not exist", () => {
		expect(readDaemonRuntimeIdentity(undefined)).toBeUndefined();
		expect(
			readDaemonRuntimeIdentity(
				path.join(os.tmpdir(), "nonexistent-pty-daemon.js"),
			),
		).toBeUndefined();
	});

	test("produces the same bundleId across symlinked paths and changes on script replacement", () => {
		const dir = makeTempDir();
		const realExec = path.join(dir, "runtime-bin");
		const realScript = path.join(dir, "pty-daemon.js");
		const linkScript = path.join(dir, "pty-daemon-link.js");
		fs.writeFileSync(realExec, "exec-v1");
		fs.writeFileSync(realScript, "console.log('v1');");
		fs.symlinkSync(realScript, linkScript);

		const a = readDaemonRuntimeIdentity(realScript, realExec);
		const b = readDaemonRuntimeIdentity(linkScript, realExec);
		expect(a).toBeDefined();
		expect(b).toBeDefined();
		expect(a?.scriptPath).toBe(resolveCanonicalPath(realScript));
		expect(b?.scriptPath).toBe(resolveCanonicalPath(realScript));
		expect(a?.bundleId).toBe(b?.bundleId);

		// In-place script update changes bundleId even when path strings stay identical.
		fs.writeFileSync(realScript, "console.log('v2');");
		const updated = readDaemonRuntimeIdentity(realScript, realExec);
		expect(updated?.bundleId).toBeDefined();
		expect(updated?.bundleId).not.toBe(a?.bundleId);
	});
});
