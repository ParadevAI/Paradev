import { describe, expect, test } from "bun:test";

function apiUrlWith(extra: Record<string, string>): string {
	const env = Object.fromEntries(
		Object.entries(process.env).filter(
			([key]) =>
				!/^(SUPERSET|PARADEV)_(API_URL|SANDBOX_WORKSPACE_ID)$/.test(key),
		),
	);
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"-e",
			'console.log((await import("./src/lib/env.ts")).env.SUPERSET_API_URL)',
		],
		cwd: `${import.meta.dir}/../..`,
		env: { ...env, ...extra },
	});
	return result.stdout.toString().trim();
}

describe("env.SUPERSET_API_URL", () => {
	test("defaults to api.paradev.com", () => {
		expect(apiUrlWith({})).toBe("https://api.paradev.com");
	});

	test("stays on api.superset.sh in a cloud workspace", () => {
		expect(apiUrlWith({ SUPERSET_SANDBOX_WORKSPACE_ID: "ws-1" })).toBe(
			"https://api.superset.sh",
		);
	});
});
