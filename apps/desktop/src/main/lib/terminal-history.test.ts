import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string | undefined;

afterEach(() => {
	if (home) rmSync(home, { recursive: true, force: true });
	home = undefined;
});

test("close() writes the backlog queued behind backpressure, then returns", () => {
	home = mkdtempSync(join(tmpdir(), "terminal-history-"));
	const script = `
		import { HistoryWriter } from ${JSON.stringify(join(import.meta.dir, "terminal-history.ts"))};
		const writer = new HistoryWriter("ws", "pane", "/tmp", 80, 24);
		await writer.init();
		writer.write("a".repeat(100_000));
		writer.write("tail");
		await writer.close(0);
		process.exit(0);
	`;
	const result = Bun.spawnSync([process.execPath, "-e", script], {
		env: { ...process.env, SUPERSET_HOME_DIR: home },
		timeout: 3000,
	});

	expect(result.exitCode).toBe(0);
	const dir = join(home, "terminal-history", "ws", "pane");
	expect(readFileSync(join(dir, "scrollback.bin"), "utf8")).toBe(
		`${"a".repeat(100_000)}tail`,
	);
	expect(
		JSON.parse(readFileSync(join(dir, "meta.json"), "utf8")).endedAt,
	).toBeString();
});
