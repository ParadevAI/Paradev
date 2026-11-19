import { expect, it } from "bun:test";
import { resolve } from "node:path";
import { createCommandsPlugin } from "@superset/cli-framework";
import config from "./cli.config";

it("keeps browser-only parsers out of the CLI bundle", async () => {
	const commandsDir = resolve(import.meta.dir, config.commandsDir);
	const build = await Bun.build({
		entrypoints: [`${commandsDir}/index.ts`],
		plugins: [createCommandsPlugin({ commandsDir }), ...(config.plugins ?? [])],
		target: "bun",
		metafile: true,
	});
	expect(build.success).toBe(true);
	const inputs = Object.keys(build.metafile?.inputs ?? {});
	expect(inputs.length).toBeGreaterThan(0);
	expect(
		inputs.filter((path) => /node_modules\/(css-tree|mdn-data)\//.test(path)),
	).toEqual([]);
});
