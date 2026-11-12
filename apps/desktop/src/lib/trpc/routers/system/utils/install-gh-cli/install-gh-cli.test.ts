import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installGhCli } from "./install-gh-cli";

const ZIP_BYTES = new TextEncoder().encode("pretend zip");
const ASSET = "gh_9.9.9_macOS_arm64.zip";
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

const RELEASE = "https://github.com/cli/cli/releases/download/v9.9.9";
const ZIP_URL = `${RELEASE}/${ASSET}`;

type Route = (url: string) => Response | Promise<Response>;

function fakeGitHub(checksum: string, overrides: Record<string, Route> = {}) {
	return async (url: string) => {
		const override = overrides[url];
		if (override) return override(url);
		if (url === "https://api.github.com/repos/cli/cli/releases/latest") {
			return Response.json({ tag_name: "v9.9.9" });
		}
		if (url === `${RELEASE}/gh_9.9.9_checksums.txt`) {
			return new Response(
				`${"0".repeat(64)}  gh_9.9.9_macOS_amd64.zip\n${checksum}  ${ASSET}\n`,
			);
		}
		if (url === ZIP_URL) return new Response(ZIP_BYTES);
		return new Response("not found", { status: 404 });
	};
}

function redirectedTo(url: string): Response {
	const response = new Response("<html></html>");
	Object.defineProperty(response, "url", { value: url });
	return response;
}

const GOOD_SUM = createHash("sha256").update(ZIP_BYTES).digest("hex");
const API_URL = "https://api.github.com/repos/cli/cli/releases/latest";
const PAGE_URL = "https://github.com/cli/cli/releases/latest";

async function fakeExtract(_zip: string, destDir: string) {
	const bin = path.join(destDir, "gh_9.9.9_macOS_arm64", "bin");
	fs.mkdirSync(bin, { recursive: true });
	fs.writeFileSync(path.join(bin, "gh"), "pretend gh");
}

const signedByGitHub = async () => true;

async function fakeReadVersion() {
	return "gh version 9.9.9 (test)\n";
}

function newBinDir() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "gh-install-test-"));
	tempDirs.push(dir);
	return path.join(dir, "bin");
}

describe("installGhCli", () => {
	test("installs only a download that matches the release checksum", async () => {
		const rejectedBinDir = newBinDir();
		const rejected = await installGhCli({
			binDir: rejectedBinDir,
			arch: "arm64",
			fetch: fakeGitHub("f".repeat(64)),
			extractZip: fakeExtract,
			readVersion: fakeReadVersion,
			isSignedByGitHub: signedByGitHub,
		});
		expect(rejected).toEqual({
			stage: "failed",
			reason: "checksum",
			downloadUrl: ZIP_URL,
		});
		expect(fs.existsSync(path.join(rejectedBinDir, "gh"))).toBe(false);

		const binDir = newBinDir();
		const installed = await installGhCli({
			binDir,
			arch: "arm64",
			fetch: fakeGitHub(GOOD_SUM),
			extractZip: fakeExtract,
			readVersion: fakeReadVersion,
			isSignedByGitHub: signedByGitHub,
		});
		expect(installed).toEqual({ stage: "done", version: "9.9.9" });
		expect(fs.statSync(path.join(binDir, "gh")).mode & 0o111).toBeTruthy();
	});

	test("installs nothing that GitHub did not sign", async () => {
		const binDir = newBinDir();
		const result = await installGhCli({
			binDir,
			arch: "arm64",
			fetch: fakeGitHub(GOOD_SUM),
			extractZip: fakeExtract,
			readVersion: fakeReadVersion,
			isSignedByGitHub: async () => false,
		});
		expect(result).toEqual({
			stage: "failed",
			reason: "signature",
			downloadUrl: ZIP_URL,
		});
		expect(fs.existsSync(path.join(binDir, "gh"))).toBe(false);
	});

	test("says the disk is full when it is", async () => {
		const result = await installGhCli({
			binDir: newBinDir(),
			arch: "arm64",
			fetch: fakeGitHub(GOOD_SUM),
			extractZip: async () => {
				throw Object.assign(new Error("no space"), { code: "ENOSPC" });
			},
			isSignedByGitHub: signedByGitHub,
		});
		expect(result).toMatchObject({ stage: "failed", reason: "disk-full" });
	});

	test("reports each failure with the macOS zip to download by hand", async () => {
		const run = async (fetcher: ReturnType<typeof fakeGitHub>) => {
			const binDir = newBinDir();
			const result = await installGhCli({
				binDir,
				arch: "arm64",
				fetch: fetcher,
				extractZip: async () => {
					throw Object.assign(new Error("EACCES"), { code: "EACCES" });
				},
			});
			expect(fs.existsSync(path.join(binDir, "gh"))).toBe(false);
			return result;
		};
		const offline = () => {
			throw new TypeError("net::ERR_INTERNET_DISCONNECTED");
		};
		const rateLimited = () =>
			new Response("rate limit exceeded", { status: 403 });

		expect(await run(fakeGitHub(GOOD_SUM, { [API_URL]: offline }))).toEqual({
			stage: "failed",
			reason: "offline",
			downloadUrl: null,
		});
		expect(
			await run(
				fakeGitHub(GOOD_SUM, { [API_URL]: rateLimited, [PAGE_URL]: offline }),
			),
		).toEqual({ stage: "failed", reason: "offline", downloadUrl: null });
		expect(
			await run(
				fakeGitHub(GOOD_SUM, {
					[API_URL]: rateLimited,
					[PAGE_URL]: () => redirectedTo(PAGE_URL),
				}),
			),
		).toEqual({ stage: "failed", reason: "rate-limited", downloadUrl: null });
		expect(
			await run(
				fakeGitHub(GOOD_SUM, {
					[ZIP_URL]: () => new Response("gone", { status: 502 }),
				}),
			),
		).toEqual({ stage: "failed", reason: "download", downloadUrl: ZIP_URL });
		expect(await run(fakeGitHub(GOOD_SUM))).toEqual({
			stage: "failed",
			reason: "install",
			downloadUrl: ZIP_URL,
		});
	});

	test("finds the version without the API when the API is rate-limited", async () => {
		const binDir = newBinDir();
		const installed = await installGhCli({
			binDir,
			arch: "arm64",
			fetch: fakeGitHub(GOOD_SUM, {
				[API_URL]: () => new Response("", { status: 429 }),
				[PAGE_URL]: () =>
					redirectedTo("https://github.com/cli/cli/releases/tag/v9.9.9"),
			}),
			extractZip: fakeExtract,
			readVersion: fakeReadVersion,
			isSignedByGitHub: signedByGitHub,
		});
		expect(installed).toEqual({ stage: "done", version: "9.9.9" });
	});
});
