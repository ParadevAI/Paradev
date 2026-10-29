import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installedPluginsFilePath } from "@superset/agent-setup";
import localCommand from "./command";

function invoke(action: string, plugin: string) {
	return localCommand.run({
		ctx: {} as never,
		args: { action, plugin } as never,
		options: {} as never,
		signal: new AbortController().signal,
	}) as Promise<{ message: string }>;
}

describe("plugins local", () => {
	const saved = process.env.SUPERSET_HOME_DIR;
	let root = "";

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "superset-plugins-local-"));
		process.env.SUPERSET_HOME_DIR = root;
	});

	afterEach(() => {
		if (saved === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = saved;
		fs.rmSync(root, { recursive: true, force: true });
	});

	test("runs without an account", () => {
		expect(localCommand.skipMiddleware).toBe(true);
	});

	test.each([
		"uninstall",
		"disable",
	])("%s of a plugin absent from this machine is a no-op", async (action) => {
		const result = await invoke(action, "linear");

		expect(result.message).toBe("linear is not installed on this machine.");
		expect(fs.existsSync(installedPluginsFilePath())).toBe(false);
	});
});
