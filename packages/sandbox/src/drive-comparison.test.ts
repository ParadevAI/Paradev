import { describe, expect, test } from "bun:test";
import { readSentinels, renderComparison } from "./drive-comparison";

describe("renderComparison", () => {
	test("one column per box, a dash where a box has no measure, LOST for a lost sentinel", () => {
		const table = renderComparison([
			{
				label: "plain",
				measures: {
					createToReadyMs: 31_000,
					firstStop: { ms: 40_000, snapshotBytes: 7 * 1024 ** 3 },
					sentinels: { "uncommitted file": true },
				},
			},
			{
				label: "drive",
				measures: {
					forkMs: 500,
					firstStop: { ms: 12_000, snapshotBytes: 2.11 * 1024 ** 3 },
					sentinels: { "uncommitted file": false },
				},
			},
		]).split("\n");
		expect(table[0]).toMatch(/plain\s+drive$/);
		expect(table.find((row) => row.startsWith("create to host.ready"))).toMatch(
			/31\.0 s\s+-$/,
		);
		expect(table.find((row) => row.startsWith("drive fork"))).toMatch(
			/-\s+0\.5 s$/,
		);
		expect(
			table.find((row) => row.startsWith("root snapshot, 1st stop")),
		).toMatch(/7\.00 GB\s+2\.11 GB$/);
		expect(
			table.find((row) => row.startsWith("kept: uncommitted file")),
		).toMatch(/yes\s+LOST$/);
	});
});

describe("readSentinels", () => {
	test("a sentinel is kept only when it reads back exactly", async () => {
		const answers: Record<string, string> = {
			"superset-sentinel-uncommitted.txt": "t0k",
			"rev-parse HEAD": "abc",
			".cache/superset-sentinel": "t0k",
			".config/superset-sentinel": "other",
			"image inspect": "",
		};
		const run = async (command: string) => {
			const key = Object.keys(answers).find((part) => command.includes(part));
			const out = key ? (answers[key] ?? "") : "";
			return { out, detail: out };
		};
		expect(
			await readSentinels(run, { token: "t0k", commit: "abc", image: "img" }),
		).toEqual({
			"uncommitted file": true,
			"local commit": true,
			"file in a bound home subtree": true,
			"file on the root disk": false,
			"docker image": false,
		});
	});
});
