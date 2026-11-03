import { afterEach, describe, expect, it } from "bun:test";
import {
	chmodSync,
	mkdirSync,
	mkdtempSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENT_CLI_OUTDATED } from "@superset/shared/agent-cli-status";
import {
	agentCliUnsupported,
	probeAgentCli,
	realAgentCli,
	resolveAgentCli,
} from "./agentCli";

const BINARY = "superset-test-agent-cli";
const dirs: string[] = [];

function fakeCli(dir: string, version: string, binary = BINARY): string {
	mkdirSync(dir, { recursive: true });
	const path = join(dir, binary);
	writeFileSync(`${path}.next`, `#!/bin/sh\necho "${binary} ${version}"\n`);
	chmodSync(`${path}.next`, 0o755);
	renameSync(`${path}.next`, path);
	return path;
}

function tempHome(): string {
	const home = mkdtempSync(join(tmpdir(), "agent-cli-"));
	dirs.push(home);
	return home;
}

afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});

const POSIX_ONLY = process.platform === "win32";

describe.skipIf(POSIX_ONLY)("realAgentCli", () => {
	it("skips the app's own bin dirs, as the wrapper does", () => {
		const home = tempHome();
		fakeCli(join(home, ".paradev-dev", "bin"), "0.0.1");
		fakeCli(join(home, ".superset", "bin"), "0.0.1");
		const real = fakeCli(join(home, "real"), "1.0.0");
		const env = {
			HOME: home,
			PATH: [
				join(home, ".paradev-dev", "bin"),
				join(home, ".superset", "bin"),
				join(home, "real"),
			].join(":"),
		};

		expect(realAgentCli(BINARY, env)?.path).toBe(real);
	});
});

describe.skipIf(POSIX_ONLY)("probeAgentCli", () => {
	it("reads the new version as soon as an update replaces the binary", async () => {
		const home = tempHome();
		const env = { HOME: home, PATH: join(home, "bin") };
		fakeCli(join(home, "bin"), "1.0.0");
		expect((await probeAgentCli(BINARY, env)).version).toBe("1.0.0");

		fakeCli(join(home, "bin"), "2.0.0");
		expect((await probeAgentCli(BINARY, env)).version).toBe("2.0.0");
	});
});

describe.skipIf(POSIX_ONLY)("resolveAgentCli", () => {
	it("marks a too-old CLI only when chat can offer its update", async () => {
		const home = tempHome();
		fakeCli(join(home, "bin"), "1.0.0", "codex");
		fakeCli(join(home, "bin"), "1.0.0");
		const env = { HOME: home, PATH: join(home, "bin") };
		const tooOld = (binary: string) =>
			resolveAgentCli({ binary, minVersion: "2.0.0", env: async () => env })
				.then(() => null)
				.catch((caught: unknown) => caught);

		expect(await tooOld("codex")).toMatchObject({ code: AGENT_CLI_OUTDATED });
		expect(await tooOld(BINARY)).not.toHaveProperty("code");
	});

	it("says how to install a supported CLI that is missing", async () => {
		const home = tempHome();
		const env = { HOME: home, PATH: join(home, "bin") };

		const error = await resolveAgentCli({
			binary: "codex",
			minVersion: "0.160.0",
			env: async () => env,
		}).catch((caught: unknown) => caught);

		expect(String(error)).toContain("npm i -g @openai/codex@latest");
	});
});

describe("agentCliUnsupported", () => {
	it("names the version to install when nothing is found", () => {
		const message = agentCliUnsupported({
			binary: "codex",
			minVersion: "0.160.0",
			found: null,
			upgrade: "npm i -g @openai/codex@latest",
		});
		expect(message).toContain("codex was not found");
		expect(message).toContain("0.160.0");
		expect(message).toContain("npm i -g @openai/codex@latest");
	});

	it("names both versions when one is too old", () => {
		const message = agentCliUnsupported({
			binary: "gemini",
			minVersion: "0.62.0",
			found: "0.2.1",
			upgrade: "npm i -g @google/gemini-cli@latest",
		});
		expect(message).toContain("0.62.0 or newer");
		expect(message).toContain("0.2.1 is installed");
	});

	it("omits an upgrade command it was not given", () => {
		expect(
			agentCliUnsupported({
				binary: "opencode",
				minVersion: "1.15.5",
				found: "1.0.0",
			}),
		).not.toContain("Upgrade with");
	});
});
