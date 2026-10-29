import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runPluginCli } from "./plugin-cli";

describe("runPluginCli", () => {
	let root = "";

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-cli-"));
	});

	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function fakeCli(body: string): string {
		const cli = path.join(root, "superset");
		fs.writeFileSync(cli, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
		return cli;
	}

	test("runs the local subcommand, which needs no login", async () => {
		const argsFile = path.join(root, "args");
		const cli = fakeCli(`echo "$@" > "${argsFile}"`);

		await runPluginCli(cli, "install", "linear");

		expect(fs.readFileSync(argsFile, "utf8").trim()).toBe(
			"plugins local install linear --json",
		);
	});

	test("rejects with the CLI's error, so the caller does not report success", async () => {
		const cli = fakeCli(
			`echo "Error: No plugin \\"linear\\"" >&2; echo "Hint: retry" >&2; exit 1`,
		);

		await expect(runPluginCli(cli, "install", "linear")).rejects.toThrow(
			'No plugin "linear"',
		);
	});
});
