import { expect, it } from "bun:test";
import { buildOptions, loadConfig } from "@superset/cli-framework";

it("keeps css-tree out of the compiled CLI", async () => {
	const build = await Bun.build({
		...buildOptions(await loadConfig(import.meta.dir)),
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
