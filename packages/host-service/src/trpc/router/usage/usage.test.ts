import { afterEach, expect, it } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const homes: string[] = [];
afterEach(() => {
	for (const home of homes.splice(0)) {
		rmSync(home, { recursive: true, force: true });
	}
});

// Bun's os.homedir() does not follow a HOME set at runtime, so the logins
// check runs in a child process whose HOME is a temporary dir.
it("usage.logins reports which profile dirs Paradev created", () => {
	const home = mkdtempSync(join(tmpdir(), "superset-usage-logins-"));
	homes.push(home);
	const env: Record<string, string | undefined> = {
		...process.env,
		HOME: home,
	};
	delete env.CODEX_HOME;
	delete env.SUPERSET_DEFAULT_CODEX_HOME;

	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"test",
			join(import.meta.dir, "fixtures/logins-created-marker.checks.ts"),
		],
		cwd: process.cwd(),
		env,
	});

	expect(
		result.exitCode,
		result.stdout.toString() + result.stderr.toString(),
	).toBe(0);
});
