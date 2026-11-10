import { afterEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentInstallEvent } from "../download-verified";
import { CLAUDE_RELEASES_URL, installClaudeCode } from "./install-claude-code";

const BINARY = new TextEncoder().encode("pretend claude binary");
const SHA = createHash("sha256").update(BINARY).digest("hex");
const tempDirs: string[] = [];

afterEach(() => {
	for (const dir of tempDirs.splice(0)) {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

function workRoot(): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), "claude-install-test-"));
	tempDirs.push(dir);
	return dir;
}

function fakeReleases(
	checksum = SHA,
	overrides: Record<string, Response> = {},
) {
	return async (url: string) => {
		if (overrides[url]) return overrides[url];
		if (url === `${CLAUDE_RELEASES_URL}/latest`) return new Response("9.9.9\n");
		if (url === `${CLAUDE_RELEASES_URL}/9.9.9/manifest.json`) {
			return Response.json({
				platforms: {
					"darwin-arm64": { checksum, size: BINARY.byteLength },
					"darwin-x64": { checksum: "0".repeat(64) },
				},
			});
		}
		if (url === `${CLAUDE_RELEASES_URL}/9.9.9/darwin-arm64/claude`) {
			return new Response(BINARY);
		}
		return new Response("not found", { status: 404 });
	};
}

function run(fetch: ReturnType<typeof fakeReleases>, signed = true) {
	const installs: Array<{ binary: string; version: string; bytes: string }> =
		[];
	const events: AgentInstallEvent[] = [];
	const result = installClaudeCode({
		fetch,
		arch: "arm64",
		installedPath: "/home/u/.local/bin/claude",
		workRoot: workRoot(),
		verifySignature: async () => signed,
		runInstall: async (binary, version) => {
			installs.push({
				binary,
				version,
				bytes: fs.readFileSync(binary, "utf8"),
			});
		},
		readVersion: async () => "9.9.9",
		onProgress: (event) => events.push(event),
	});
	return { result, installs, events };
}

describe("installClaudeCode", () => {
	test("runs the verified binary's own install for the manifest's version", async () => {
		const { result, installs, events } = run(fakeReleases());
		expect(await result).toEqual({
			stage: "done",
			version: "9.9.9",
			path: "/home/u/.local/bin/claude",
		});
		expect(installs).toHaveLength(1);
		expect(installs[0]?.version).toBe("9.9.9");
		expect(installs[0]?.bytes).toBe("pretend claude binary");
		expect(events.map((event) => event.stage)).toContain("verifying");
		expect(fs.existsSync(installs[0]?.binary ?? "")).toBe(false);
	});

	test("never runs a download whose SHA-256 differs from the manifest", async () => {
		const { result, installs } = run(fakeReleases("f".repeat(64)));
		expect(await result).toEqual({ stage: "failed", reason: "checksum" });
		expect(installs).toHaveLength(0);
	});

	test("never runs a binary Anthropic did not sign", async () => {
		const { result, installs } = run(fakeReleases(), false);
		expect(await result).toEqual({ stage: "failed", reason: "signature" });
		expect(installs).toHaveLength(0);
	});

	test("rejects a manifest with no checksum for this Mac", async () => {
		const fetch = fakeReleases(SHA, {
			[`${CLAUDE_RELEASES_URL}/9.9.9/manifest.json`]: Response.json({
				platforms: {},
			}),
		});
		expect(await run(fetch).result).toEqual({
			stage: "failed",
			reason: "checksum",
		});
	});

	test("reads an unexpected version answer as a failed download", async () => {
		const fetch = fakeReleases(SHA, {
			[`${CLAUDE_RELEASES_URL}/latest`]: new Response("<html>"),
		});
		expect(await run(fetch).result).toEqual({
			stage: "failed",
			reason: "download",
		});
	});

	test("reports offline when the request cannot be made", async () => {
		const fetch = async () => {
			throw new TypeError("network down");
		};
		expect(await run(fetch).result).toEqual({
			stage: "failed",
			reason: "offline",
		});
	});
});
