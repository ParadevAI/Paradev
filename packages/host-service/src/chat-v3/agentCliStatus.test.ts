import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentCliStatus } from "./agentCliStatus";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

function fakeCli(binary: string, version: string, marker?: string) {
	const home = mkdtempSync(join(tmpdir(), "agent-cli-status-"));
	dirs.push(home);
	const bin = join(home, "bin");
	mkdirSync(bin);
	const touch = marker ? `touch "${marker}"\n` : "";
	writeFileSync(
		join(bin, binary),
		`#!/bin/sh\n${touch}echo "${binary} ${version}"\n`,
	);
	chmodSync(join(bin, binary), 0o755);
	return { home, env: { HOME: home, PATH: bin } };
}

const newest = (version: string) => async () => version;

describe.skipIf(process.platform === "win32")("agentCliStatus", () => {
	it("reports a CLI below the chat's floor and behind the newest release", async () => {
		const { env } = fakeCli("codex", "0.159.2");

		expect(
			await agentCliStatus({
				harness: "codex-acp",
				env,
				latest: newest("0.166.0"),
			}),
		).toMatchObject({
			binary: "codex",
			installed: "0.159.2",
			minVersion: "0.160.0",
			belowFloor: true,
			latest: "0.166.0",
			behind: true,
		});
	});

	it("counts a prerelease as behind its release", async () => {
		const { env } = fakeCli("codex", "0.166.0-alpha.1");

		expect(
			await agentCliStatus({
				harness: "codex-acp",
				env,
				latest: newest("0.166.0"),
			}),
		).toMatchObject({ belowFloor: false, behind: true });
	});

	it("leaves a CLI it cannot update alone, without running it", async () => {
		const marker = join(tmpdir(), `agent-cli-status-ran-${process.pid}`);
		const { env } = fakeCli("opencode", "1.0.0", marker);
		let looked = false;

		expect(
			await agentCliStatus({
				harness: "opencode-acp",
				env,
				latest: async () => {
					looked = true;
					return "9.9.9";
				},
			}),
		).toBeNull();
		expect(existsSync(marker)).toBe(false);
		expect(looked).toBe(false);
	});
});
