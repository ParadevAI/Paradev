import { afterEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { shellQuote } from "../shell-quote";
import { installCliScript } from "./install";

const installer = resolve(
	import.meta.dir,
	"../../../../../apps/marketing/public/cli/install.sh",
);
const roots: string[] = [];
afterEach(() => {
	for (const root of roots.splice(0))
		rmSync(root, { recursive: true, force: true });
});

async function runInstaller({
	status,
	fallback = true,
	latestStatus = 200,
	version = "9.9.9",
}: {
	status: number;
	fallback?: boolean;
	latestStatus?: number;
	version?: string | null;
}) {
	const root = mkdtempSync(join(tmpdir(), "cli-installer-"));
	roots.push(root);
	const bin = join(root, "bin");
	const payload = join(root, "payload");
	const installDir = join(root, "installed CLI");
	mkdirSync(bin);
	mkdirSync(join(payload, "bin"), { recursive: true });
	for (const name of ["superset", "superset-host"]) {
		writeFileSync(
			join(payload, "bin", name),
			"#!/bin/sh\nprintf '2.0.5\\n'\n",
			{ mode: 0o755 },
		);
	}
	const archivePath = join(root, "release.tar.gz");
	const tar = Bun.spawnSync(["tar", "-czf", archivePath, "-C", payload, "."]);
	if (tar.exitCode !== 0) throw new Error(tar.stderr.toString());
	const archive = await Bun.file(archivePath).arrayBuffer();
	const requested: string[] = [];
	const server = Bun.serve({
		hostname: "127.0.0.1",
		port: 0,
		fetch(request) {
			const path = new URL(request.url).pathname;
			if (path === "/install.sh") return new Response(Bun.file(installer));
			requested.push(path);
			const code = path.includes("/cli-latest/") ? latestStatus : status;
			return new Response(code === 200 ? archive : "release unavailable", {
				status: code,
			});
		},
	});
	const curl = Bun.which("curl");
	if (!curl) throw new Error("curl is required for the installer test");
	writeFileSync(
		join(bin, "curl"),
		[
			"#!/bin/bash",
			"args=()",
			'for arg in "$@"; do',
			'  case "$arg" in',
			`    https://github.com/*) arg="$FIXTURE_ORIGIN/\${arg#https://github.com/}" ;;`,
			"  esac",
			'  args+=("$arg")',
			"done",
			`exec ${shellQuote(curl)} -q "\${args[@]}"`,
			"",
		].join("\n"),
		{ mode: 0o755 },
	);
	try {
		const command = fallback
			? installCliScript({
					installerUrl: `${server.url}install.sh`,
					installDir,
					version,
				})
			: `sh ${shellQuote(installer)} --no-next-steps`;
		const child = Bun.spawn(["sh", "-c", command], {
			env: {
				PATH: `${bin}:${join(installDir, "bin")}:${process.env.PATH ?? "/usr/bin:/bin"}`,
				SUPERSET_HOME: installDir,
				SUPERSET_VERSION: "cli-v9.9.9",
				FIXTURE_ORIGIN: server.url.toString().replace(/\/$/, ""),
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		const [exitCode, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { exitCode, stdout, stderr, requested, installDir };
	} finally {
		server.stop(true);
	}
}

test("hosts add installs cli-latest when its pinned release is missing", async () => {
	const result = await runInstaller({ status: 404 });
	expect(result.exitCode).toBe(0);
	expect(result.requested.map((path) => path.split("/").at(-2))).toEqual([
		"cli-v9.9.9",
		"cli-latest",
	]);
	expect(result.stderr).toContain("cli-latest");
	const installed = Bun.spawnSync([
		join(result.installDir, "bin", "superset"),
		"--version",
	]);
	expect(installed.exitCode).toBe(0);
	expect(installed.stdout.toString().trim()).toBe("2.0.5");
	expect(result.stdout).not.toContain("auth login");
});

test("keeps a published pinned release without a fallback request", async () => {
	const result = await runInstaller({ status: 200 });
	expect(result.exitCode).toBe(0);
	expect(result.requested).toHaveLength(1);
});

test.each([
	{ name: "an explicit pin", status: 404, fallback: false, latestStatus: 200 },
	{ name: "a server error", status: 500, fallback: true, latestStatus: 200 },
])("does not retry $name as cli-latest", async (options) => {
	const result = await runInstaller(options);
	expect(result.exitCode).not.toBe(0);
	expect(result.requested).toHaveLength(1);
});

test("reports failure when the latest release is unavailable too", async () => {
	const result = await runInstaller({ status: 404, latestStatus: 404 });
	expect(result.exitCode).not.toBe(0);
	expect(result.requested).toHaveLength(2);
	expect(result.stderr).toContain("Failed to download");
});

test("does not retry the latest release URL when it is already selected", async () => {
	const result = await runInstaller({
		status: 404,
		latestStatus: 404,
		version: null,
	});
	expect(result.exitCode).not.toBe(0);
	expect(result.requested).toHaveLength(1);
});
