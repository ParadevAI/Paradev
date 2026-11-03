import { expect, test } from "bun:test";

test("terminal ownership is safe while loading and independent of native hook arrival", () => {
	const result = Bun.spawnSync({
		cmd: [process.execPath, "test", `${import.meta.dir}/fixtures/checks.tsx`],
		env: { ...process.env, NODE_ENV: "test" },
	});
	expect(
		result.exitCode,
		result.stdout.toString() + result.stderr.toString(),
	).toBe(0);
});
