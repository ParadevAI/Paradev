import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { config } from "dotenv";

export const PDEV_VERSION = "0.1.1";
const PDEV_DOWNLOAD_URL = `https://github.com/superset-sh/pdev/releases/download/v${PDEV_VERSION}`;
export const PDEV_SHA256: Record<string, string> = {
	"pdev-0.1.1-darwin-arm64.tar.gz":
		"b0bce974fc86d56d89ee2302e51f92a8c5a4020f65329de0996c196a5972b045",
	"pdev-0.1.1-darwin-x64.tar.gz":
		"1feb258b6729a71a8c62b8f67fa2c6f80ce274e66d27b565d6932fd25226fdc7",
	"pdev-0.1.1-linux-arm64.tar.gz":
		"6b36cc67c48efb446157944db1c7025e956877806e8af040dad5c47e1243281a",
	"pdev-0.1.1-linux-x64.tar.gz":
		"e3bc68aed6d1f522ac4d5cbe65c58ec6624bef79d44230db7e37f55a09fe89b8",
};
const BUNDLED_FROM_FILE = ".bundled-from";

const PDEV_TARGETS: Record<string, readonly string[]> = {
	darwin: ["arm64", "x64"],
	linux: ["arm64", "x64"],
};

export function pdevAssetName(
	platform: string,
	arch: string,
	version: string = PDEV_VERSION,
): string | null {
	if (!PDEV_TARGETS[platform]?.includes(arch)) return null;
	return `pdev-${version}-${platform}-${arch}.tar.gz`;
}

function run(command: string, args: string[]): Promise<void> {
	return new Promise((resolvePromise, reject) => {
		const child = spawn(command, args, { stdio: "inherit" });
		child.on("error", reject);
		child.on("exit", (code) => {
			if (code === 0) {
				resolvePromise();
				return;
			}
			reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
		});
	});
}

export function installPdevFolder(
	sourceDir: string,
	destDir: string,
	bundledFrom: string,
): void {
	const binary = join(sourceDir, "pdev");
	if (!existsSync(binary)) {
		throw new Error(`No pdev executable at ${binary}`);
	}
	rmSync(destDir, { recursive: true, force: true });
	mkdirSync(dirname(destDir), { recursive: true });
	cpSync(sourceDir, destDir, {
		recursive: true,
		filter: (source) => !basename(source).startsWith("._"),
	});
	chmodSync(join(destDir, "pdev"), 0o755);
	writeFileSync(join(destDir, BUNDLED_FROM_FILE), bundledFrom);
}

export async function extractPdevTarball(
	tarball: string,
	destDir: string,
	bundledFrom: string,
): Promise<void> {
	const extractDir = mkdtempSync(join(tmpdir(), "pdev-extract-"));
	try {
		await run("tar", ["-xzf", tarball, "-C", extractDir]);
		installPdevFolder(join(extractDir, "pdev"), destDir, bundledFrom);
	} finally {
		rmSync(extractDir, { recursive: true, force: true });
	}
}

export function isBundled(destDir: string, bundledFrom: string): boolean {
	const marker = join(destDir, BUNDLED_FROM_FILE);
	return (
		existsSync(join(destDir, "pdev")) &&
		existsSync(marker) &&
		readFileSync(marker, "utf-8") === bundledFrom
	);
}

async function downloadAsset(
	assetName: string,
	expectedSha256: string,
	outfile: string,
	fetcher: typeof fetch,
): Promise<void> {
	const response = await fetcher(`${PDEV_DOWNLOAD_URL}/${assetName}`);
	if (!response.ok) {
		throw new Error(`Could not download ${assetName}: HTTP ${response.status}`);
	}
	const bytes = Buffer.from(await response.arrayBuffer());
	const sha256 = createHash("sha256").update(bytes).digest("hex");
	if (sha256 !== expectedSha256) {
		throw new Error(
			`${assetName} has SHA-256 ${sha256}, expected ${expectedSha256}`,
		);
	}
	writeFileSync(outfile, bytes);
}

export async function main(
	env: NodeJS.ProcessEnv = process.env,
	destDir: string = resolve(import.meta.dirname, "../dist/resources/bin/pdev"),
	fetcher: typeof fetch = fetch,
	checksums: Record<string, string> = PDEV_SHA256,
) {
	const platform = env.TARGET_PLATFORM ?? process.platform;
	const arch = env.TARGET_ARCH ?? process.arch;

	if (env.PDEV_BUNDLE_DIR) {
		installPdevFolder(
			resolve(env.PDEV_BUNDLE_DIR),
			destDir,
			`local:${env.PDEV_BUNDLE_DIR}`,
		);
		console.log(`[desktop] bundled pdev copied from ${env.PDEV_BUNDLE_DIR}`);
		return;
	}

	const required = env.PDEV_BUNDLE_REQUIRED === "1";
	const assetName = pdevAssetName(platform, arch);
	const expectedSha256 = assetName ? checksums[assetName] : undefined;
	if (!assetName || !expectedSha256) {
		if (required) {
			throw new Error(
				`pdev is required but not shipped for ${platform}/${arch}`,
			);
		}
		rmSync(destDir, { recursive: true, force: true });
		console.log(`[desktop] pdev is not bundled for ${platform}/${arch}`);
		return;
	}

	const bundledFrom = `${assetName} sha256:${expectedSha256}`;
	if (isBundled(destDir, bundledFrom)) {
		console.log(`[desktop] bundled pdev is up to date (${assetName})`);
		return;
	}

	const downloadDir = mkdtempSync(join(tmpdir(), "pdev-download-"));
	try {
		const tarball = join(downloadDir, assetName);
		await downloadAsset(assetName, expectedSha256, tarball, fetcher);
		await extractPdevTarball(tarball, destDir, bundledFrom);
		console.log(`[desktop] bundled pdev written to ${destDir}`);
	} catch (error) {
		if (required) throw error;
		rmSync(destDir, { recursive: true, force: true });
		console.warn(`[desktop] pdev is not bundled: ${String(error)}`);
	} finally {
		rmSync(downloadDir, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	config({
		path: resolve(import.meta.dirname, "../../../.env"),
		override: false,
		quiet: true,
	});
	await main();
}
