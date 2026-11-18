import { expect, test } from "bun:test";
import { existsSync } from "node:fs";

const root = `${import.meta.dir}/../../..`;

test.skipIf(!existsSync(`${root}/apps`))(
	"only this package names the fleet scope",
	() => {
		const { stdout } = Bun.spawnSync(
			[
				"git",
				"grep",
				"-l",
				"-i",
				"-E",
				"cloudfleetscope|cloud-usage-fleet",
				"--",
				"apps",
				"packages",
				":!packages/db",
			],
			{ cwd: root },
		);
		expect(stdout.toString().trim().split("\n").filter(Boolean)).toEqual([]);
	},
);
