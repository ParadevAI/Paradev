import { afterEach, expect, it } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: shell integration test executes the generated command
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
// biome-ignore lint/style/noRestrictedImports: shell integration test uses a temporary directory
import { tmpdir } from "node:os";
// biome-ignore lint/style/noRestrictedImports: shell integration test uses filesystem paths
import { join } from "node:path";
import { switchSignInCommand } from "../../switchSignInCommand";
import { apiBillingLoginCommand } from "../apiBilling";

const dirs: string[] = [];
afterEach(async () => {
	await Promise.all(
		dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
	);
});
for (const exitCode of [0, 1])
	it(`preserves Codex exit ${exitCode} while clearing the key`, async () => {
		const dir = await mkdtemp(join(tmpdir(), "superset-api-login-"));
		dirs.push(dir);
		await writeFile(
			join(dir, "codex"),
			`#!/bin/sh\ncat >/dev/null\nexit ${exitCode}\n`,
			{ mode: 0o755 },
		);
		const command = apiBillingLoginCommand("codex", `'${dir}'`);
		const result = spawnSync("/bin/bash", ["-c", command], {
			cwd: dir,
			env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin` },
			input: "fake-test-key\n",
			encoding: "utf8",
		});

		expect(result.stderr.toString()).toBe("");
		expect(result.status).toBe(exitCode);
		expect(result.stdout.toString()).not.toContain("fake-test-key");
		const marker = await readFile(
			join(dir, ".superset-api-billing"),
			"utf8",
		).catch(() => null);
		expect(marker).toBe(exitCode === 0 ? "codex" : null);
	});

/**
 * Runs the system-default Codex API re-sign against a stub codex that
 * records the CODEX_HOME it got, in a shell with `env` set, and returns
 * where the login and the API-billing marker landed.
 */
async function reSignSystemDefault(
	env: (dir: string) => Record<string, string>,
) {
	const dir = await mkdtemp(join(tmpdir(), "superset-api-login-"));
	dirs.push(dir);
	await Promise.all(
		[".codex", "selected", "ambient"].map((name) => mkdir(join(dir, name))),
	);
	await writeFile(
		join(dir, "codex"),
		`#!/bin/sh\ncat >/dev/null\nprintf '%s' "$CODEX_HOME" > '${dir}/ran-with'\n`,
		{ mode: 0o755 },
	);
	const command = switchSignInCommand({
		agent: "codex",
		credentialKind: "api_key",
		selection: null,
	});
	const result = spawnSync("/bin/bash", ["-c", command], {
		cwd: dir,
		env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin`, ...env(dir) },
		input: "fake-test-key\n",
		encoding: "utf8",
	});
	expect(result.status, result.stderr.toString()).toBe(0);
	const read = (path: string) => readFile(path, "utf8").catch(() => null);
	const markedIn: string[] = [];
	for (const name of [".codex", "selected", "ambient"]) {
		if (await read(join(dir, name, ".superset-api-billing"))) {
			markedIn.push(name);
		}
	}
	return { dir, ranWith: await read(join(dir, "ran-with")), markedIn };
}

it("re-signs the ambient Codex home, not the selected one, in a Paradev terminal", async () => {
	const { dir, ranWith, markedIn } = await reSignSystemDefault((home) => ({
		CODEX_HOME: join(home, "selected"),
		SUPERSET_DEFAULT_CODEX_HOME: join(home, "selected"),
		SUPERSET_AMBIENT_CODEX_HOME: join(home, "ambient"),
	}));
	expect(ranWith).toBe(join(dir, "ambient"));
	expect(markedIn).toEqual(["ambient"]);
});

it("re-signs the CLI's own Codex home outside a Paradev terminal", async () => {
	const { dir, ranWith, markedIn } = await reSignSystemDefault(() => ({}));
	expect(ranWith).toBe(join(dir, ".codex"));
	expect(markedIn).toEqual([".codex"]);
});
