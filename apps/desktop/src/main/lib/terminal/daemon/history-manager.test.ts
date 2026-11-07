import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string | undefined;

afterEach(() => {
	if (home) rmSync(home, { recursive: true, force: true });
	home = undefined;
});

test("clear scrollback keeps output queued before the clear out of the new history", () => {
	home = mkdtempSync(join(tmpdir(), "history-manager-"));
	const script = `
		import { HistoryManager } from ${JSON.stringify(join(import.meta.dir, "history-manager.ts"))};
		const manager = new HistoryManager();
		const session = { workspaceId: "ws", cwd: "/tmp", cols: 80, rows: 24 };
		await manager.initHistoryWriter({ paneId: "pane", ...session });
		manager.writeToHistory("pane", "a".repeat(100_000), () => session);
		manager.writeToHistory("pane", "b".repeat(1000), () => session);
		manager.writeToHistory("pane", "\\x1b[3Jafter", () => session);
		while (!manager.getHistoryWriter("pane")) await Bun.sleep(1);
		await manager.cleanup();
		process.exit(0);
	`;
	const result = Bun.spawnSync([process.execPath, "-e", script], {
		env: { ...process.env, SUPERSET_HOME_DIR: home },
		timeout: 3000,
	});

	expect(result.stderr.toString()).toBe("");
	expect(result.exitCode).toBe(0);
	expect(
		readFileSync(
			join(home, "terminal-history", "ws", "pane", "scrollback.bin"),
			"utf8",
		),
	).toBe("after");
});
