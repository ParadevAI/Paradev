import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CODEX_REGISTRY_URL, installCodex } from "./install-codex";

const TARBALL = new TextEncoder().encode("pretend tarball");
const INTEGRITY = `sha512-${createHash("sha512").update(TARBALL).digest("base64")}`;
const TARBALL_URL =
	"https://registry.npmjs.org/@openai/codex/-/codex-9.9.9-darwin-arm64.tgz";
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function tempDir(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codex-install-test-"));
	tempDirs.push(dir);
	return dir;
}

function fakeRegistry(dist: { tarball?: string; integrity?: string } = {}) {
	return async (url: string) => {
		if (url === `${CODEX_REGISTRY_URL}/latest`) {
			return Response.json({ version: "9.9.9" });
		}
		if (url === `${CODEX_REGISTRY_URL}/9.9.9-darwin-arm64`) {
			return Response.json({
				dist: { tarball: TARBALL_URL, integrity: INTEGRITY, ...dist },
			});
		}
		if (url === TARBALL_URL) return new Response(TARBALL);
		return new Response("not found", { status: 404 });
	};
}

async function fakeExtract(_tarball: string, destDir: string): Promise<void> {
	const bin = path.join(destDir, "vendor", "aarch64-apple-darwin", "bin");
	fs.mkdirSync(bin, { recursive: true });
	fs.writeFileSync(path.join(bin, "codex"), "#!/bin/sh\necho codex\n", {
		mode: 0o755,
	});
}

function run(fetch: ReturnType<typeof fakeRegistry>, signed = true) {
	const root = tempDir();
	const rootDir = path.join(root, "agents", "codex");
	const launcherPath = path.join(root, "agents", "bin", "codex");
	fs.mkdirSync(path.join(rootDir, "1.0.0"), { recursive: true });
	const result = installCodex({
		fetch,
		arch: "arm64",
		rootDir,
		launcherPath,
		verifySignature: async () => signed,
		extractTarball: fakeExtract,
		readVersion: async () => "9.9.9",
	});
	return { result, rootDir, launcherPath };
}

describe("installCodex", () => {
	test("puts the release in place behind a launcher and drops older ones", async () => {
		const { result, rootDir, launcherPath } = run(fakeRegistry());
		expect(await result).toEqual({
			stage: "done",
			version: "9.9.9",
			path: launcherPath,
		});
		expect(fs.readFileSync(launcherPath, "utf8")).toContain(
			path.join(
				rootDir,
				"9.9.9",
				"vendor",
				"aarch64-apple-darwin",
				"bin",
				"codex",
			),
		);
		expect(fs.readdirSync(rootDir)).toEqual(["9.9.9"]);
	});

	test("installs nothing when the tarball's sha512 differs from dist.integrity", async () => {
		const wrong = `sha512-${createHash("sha512").update("other").digest("base64")}`;
		const { result, rootDir, launcherPath } = run(
			fakeRegistry({ integrity: wrong }),
		);
		expect(await result).toEqual({ stage: "failed", reason: "checksum" });
		expect(fs.existsSync(launcherPath)).toBe(false);
		expect(fs.readdirSync(rootDir)).toEqual(["1.0.0"]);
	});

	test("refuses a tarball from outside the npm registry", async () => {
		const { result } = run(
			fakeRegistry({ tarball: "https://example.com/codex.tgz" }),
		);
		expect(await result).toEqual({ stage: "failed", reason: "checksum" });
	});

	test("installs nothing OpenAI did not sign", async () => {
		const { result, launcherPath } = run(fakeRegistry(), false);
		expect(await result).toEqual({ stage: "failed", reason: "signature" });
		expect(fs.existsSync(launcherPath)).toBe(false);
	});
});
