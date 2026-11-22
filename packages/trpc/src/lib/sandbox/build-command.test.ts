import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	detachedCommandScript,
	parseCommandState,
	readCommandScript,
} from "./build-command";

function bash(script: string): string {
	const result = Bun.spawnSync(["bash", "-c", script]);
	return result.stdout.toString();
}

describe("build commands on the box", () => {
	test.skipIf(!Bun.which("timeout"))(
		"a second start of the same command does not run it again",
		() => {
			const root = mkdtempSync(join(tmpdir(), "build-command-"));
			const dir = join(root, "install");
			const counter = join(root, "runs");
			const start = detachedCommandScript({
				dir,
				script: `echo run >> ${counter}; echo hello; exit 3`,
				timeoutSeconds: 30,
			});
			expect(parseCommandState(bash(readCommandScript(dir)))).toEqual({
				exitCode: null,
				tail: "",
			});
			bash(start);
			bash(start);
			expect(readFileSync(counter, "utf8")).toBe("run\n");
			expect(parseCommandState(bash(readCommandScript(dir)))).toEqual({
				exitCode: 3,
				tail: "hello",
			});
		},
	);

	test("an unreadable state is an error, not a finished command", () => {
		expect(() => parseCommandState("garbage\n")).toThrow();
	});
});
