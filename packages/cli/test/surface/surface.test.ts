import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
	BASELINE_PATH,
	buildSurface,
	type CliSurface,
	REGENERATE_COMMAND,
} from "../../scripts/cli-surface";
import { diffSurface } from "./diff-surface";

describe("CLI surface", async () => {
	const baseline: CliSurface = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
	const live = await buildSurface();
	const diff = diffSurface(baseline, live);

	it("removes or renames no command, flag, argument or alias in the baseline", () => {
		expect(diff.breaking).toEqual([]);
	});

	it("matches the baseline, so every addition is recorded", () => {
		if (diff.breaking.length || Bun.deepEquals(live, baseline, true)) return;
		throw new Error(
			[
				`The CLI surface changed without a baseline update. Review, then run: ${REGENERATE_COMMAND}`,
				...diff.additions.map((line) => `  + ${line}`),
			].join("\n"),
		);
	});
});
