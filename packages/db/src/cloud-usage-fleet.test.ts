import { expect, test } from "bun:test";

test("only this package imports the fleet scope", () => {
	const { stdout } = Bun.spawnSync(
		[
			"git",
			"grep",
			"-l",
			"-E",
			"cloud-usage-fleet|cloudFleetScope",
			"--",
			"apps",
			"packages",
			":!packages/db",
		],
		{ cwd: `${import.meta.dir}/../../..` },
	);
	expect(stdout.toString().trim().split("\n").filter(Boolean)).toEqual([]);
});
