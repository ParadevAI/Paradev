import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
	extractPdevTarball,
	isBundled,
	main,
	PDEV_VERSION,
	pdevAssetName,
} from "./build-bundled-pdev";

const offline = (async () => {
	throw new Error("offline");
}) as unknown as typeof fetch;

describe("build-bundled-pdev", () => {
	let tempDir: string;
	let sourceDir: string;
	let destDir: string;

	beforeEach(() => {
		tempDir = mkdtempSync(path.join(tmpdir(), "superset-pdev-bundle-"));
		sourceDir = path.join(tempDir, "src", "pdev");
		destDir = path.join(tempDir, "dist", "resources", "bin", "pdev");
		mkdirSync(path.join(sourceDir, "assets"), { recursive: true });
		writeFileSync(path.join(sourceDir, "pdev"), "#!/bin/sh\necho 0.1.0\n");
		writeFileSync(path.join(sourceDir, "assets", "theme.json"), "{}");
		writeFileSync(path.join(sourceDir, "._pdev"), "macOS metadata");
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
	});

	it("maps release targets and skips Windows", () => {
		expect(pdevAssetName("darwin", "arm64", "0.1.0")).toBe(
			"pdev-0.1.0-darwin-arm64.tar.gz",
		);
		expect(pdevAssetName("linux", "x64", "0.1.0")).toBe(
			"pdev-0.1.0-linux-x64.tar.gz",
		);
		expect(pdevAssetName("win32", "x64")).toBeNull();
		expect(pdevAssetName("linux", "ia32")).toBeNull();
	});

	function packSource(): string {
		const tarball = path.join(tempDir, "pdev.tar.gz");
		const proc = Bun.spawnSync([
			"tar",
			"-czf",
			tarball,
			"-C",
			path.dirname(sourceDir),
			"pdev",
		]);
		expect(proc.exitCode).toBe(0);
		return tarball;
	}

	it("extracts the pdev folder from a release tarball", async () => {
		const tarball = packSource();

		await extractPdevTarball(
			tarball,
			destDir,
			"pdev-0.1.0-darwin-arm64.tar.gz",
		);

		expect(statSync(path.join(destDir, "pdev")).mode & 0o111).not.toBe(0);
		expect(existsSync(path.join(destDir, "assets", "theme.json"))).toBe(true);
		expect(isBundled(destDir, "pdev-0.1.0-darwin-arm64.tar.gz")).toBe(true);
		expect(isBundled(destDir, "pdev-0.1.0-darwin-x64.tar.gz")).toBe(false);
	});

	it("copies a local pdev folder when PDEV_BUNDLE_DIR is set", async () => {
		await main({ PDEV_BUNDLE_DIR: sourceDir }, destDir);

		expect(readFileSync(path.join(destDir, "pdev"), "utf-8")).toContain(
			"0.1.0",
		);
		expect(existsSync(path.join(destDir, "assets", "theme.json"))).toBe(true);
		expect(existsSync(path.join(destDir, "._pdev"))).toBe(false);
	});

	it("downloads the release archive and checks its SHA-256", async () => {
		const bytes = readFileSync(packSource());
		const assetName = `pdev-${PDEV_VERSION}-linux-x64.tar.gz`;
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		const requested: string[] = [];
		const fetcher = (async (url: string) => {
			requested.push(url);
			return new Response(bytes);
		}) as unknown as typeof fetch;

		await main(
			{ TARGET_PLATFORM: "linux", TARGET_ARCH: "x64" },
			destDir,
			fetcher,
			{
				[assetName]: sha256,
			},
		);

		expect(requested).toEqual([
			`https://github.com/superset-sh/pdev/releases/download/v${PDEV_VERSION}/${assetName}`,
		]);
		expect(isBundled(destDir, `${assetName} sha256:${sha256}`)).toBe(true);
	});

	it("downloads again when a cached bundle was not verified with the pinned SHA-256", async () => {
		const assetName = `pdev-${PDEV_VERSION}-linux-x64.tar.gz`;
		const bytes = readFileSync(packSource());
		const sha256 = createHash("sha256").update(bytes).digest("hex");
		await extractPdevTarball(packSource(), destDir, assetName);
		let downloads = 0;
		const fetcher = (async () => {
			downloads++;
			return new Response(bytes);
		}) as unknown as typeof fetch;
		const env = { TARGET_PLATFORM: "linux", TARGET_ARCH: "x64" };

		await main(env, destDir, fetcher, { [assetName]: sha256 });
		await main(env, destDir, fetcher, { [assetName]: sha256 });

		expect(downloads).toBe(1);
	});

	it("refuses an archive whose SHA-256 does not match", async () => {
		const env = { TARGET_PLATFORM: "linux", TARGET_ARCH: "x64" };
		const fetcher = (async () =>
			new Response("tampered")) as unknown as typeof fetch;
		const checksums = {
			[`pdev-${PDEV_VERSION}-linux-x64.tar.gz`]: "0".repeat(64),
		};

		await main(env, destDir, fetcher, checksums);
		expect(existsSync(destDir)).toBe(false);

		await expect(
			main({ ...env, PDEV_BUNDLE_REQUIRED: "1" }, destDir, fetcher, checksums),
		).rejects.toThrow("SHA-256");
	});

	it("removes a bundle for another target when it cannot download", async () => {
		await main({ PDEV_BUNDLE_DIR: sourceDir }, destDir);

		await main(
			{ TARGET_PLATFORM: "linux", TARGET_ARCH: "x64" },
			destDir,
			offline,
		);

		expect(existsSync(destDir)).toBe(false);
	});

	it("removes a stale bundle for a target pdev does not ship", async () => {
		await main({ PDEV_BUNDLE_DIR: sourceDir }, destDir);

		await main({ TARGET_PLATFORM: "win32", TARGET_ARCH: "x64" }, destDir);

		expect(existsSync(destDir)).toBe(false);
	});

	it("fails a required bundle for a target pdev does not ship", async () => {
		await expect(
			main(
				{
					TARGET_PLATFORM: "win32",
					TARGET_ARCH: "x64",
					PDEV_BUNDLE_REQUIRED: "1",
				},
				destDir,
			),
		).rejects.toThrow("not shipped for win32/x64");
	});
});
