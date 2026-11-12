import { describe, expect, test } from "bun:test";
import { runProcess } from "./run-process";

describe("runProcess", () => {
	test("kills the child when the install is cancelled", async () => {
		const controller = new AbortController();
		const started = Date.now();
		const result = runProcess("/bin/sleep", ["5"], {
			env: { PATH: "/bin:/usr/bin" },
			timeoutMs: 10_000,
			signal: controller.signal,
		});
		controller.abort();
		expect((await result).code).toBeNull();
		expect(Date.now() - started).toBeLessThan(2_000);
	});
});
