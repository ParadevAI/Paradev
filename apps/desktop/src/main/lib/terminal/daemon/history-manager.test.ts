import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let home: string | undefined;

afterEach(() => {
	if (home) rmSync(home, { recursive: true, force: true });
	home = undefined;
});

const harness = `
	import { readFileSync } from "node:fs";
	import { join } from "node:path";
	import { HistoryManager } from ${JSON.stringify(join(import.meta.dir, "history-manager.ts"))};
	import { HistoryWriter } from ${JSON.stringify(join(import.meta.dir, "../../terminal-history.ts"))};

	const gate = () => {
		let release;
		const promise = new Promise((resolve) => { release = resolve; });
		return { promise, release };
	};
	let closeGate;
	let initGate;
	const closes = [];
	const inits = [];
	const originalClose = HistoryWriter.prototype.close;
	const originalInit = HistoryWriter.prototype.init;
	HistoryWriter.prototype.close = function (...args) {
		const held = closeGate?.promise ?? Promise.resolve();
		const closing = held.then(() => originalClose.apply(this, args));
		closes.push(closing);
		return closing;
	};
	HistoryWriter.prototype.init = function (...args) {
		const held = initGate?.promise ?? Promise.resolve();
		const initializing = held.then(() => originalInit.apply(this, args));
		inits.push(initializing);
		return initializing;
	};
	const tick = () => new Promise((resolve) => setImmediate(resolve));

	const manager = new HistoryManager();
	const session = { workspaceId: "ws", cwd: "/tmp", cols: 80, rows: 24 };
	const getSession = () => session;
	await manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "old" });
`;

const report = `
	for (;;) {
		const count = closes.length + inits.length;
		await Promise.all([...closes, ...inits]);
		await tick();
		if (count === closes.length + inits.length) break;
	}
	await manager.cleanup();
	const history = readFileSync(
		join(process.env.SUPERSET_HOME_DIR, "terminal-history", "ws", "pane", "scrollback.bin"),
		"utf8",
	);
	console.log(JSON.stringify({ history, inits: inits.length }));
	process.exit(0);
`;

function runScenario(body: string) {
	home = mkdtempSync(join(tmpdir(), "history-manager-"));
	const result = Bun.spawnSync(
		[process.execPath, "-e", harness + body + report],
		{ env: { ...process.env, SUPERSET_HOME_DIR: home }, timeout: 3000 },
	);
	expect(result.stderr.toString()).toBe("");
	expect(result.exitCode).toBe(0);
	return JSON.parse(result.stdout.toString());
}

test("clear scrollback keeps the old backlog out and output during the close in the new history", () => {
	expect(
		runScenario(`
			const old = manager.getHistoryWriter("pane");
			old.isBackpressured = true;
			manager.writeToHistory("pane", "backlog", getSession);
			closeGate = gate();
			manager.writeToHistory("pane", "\\x1b[3Jafter", getSession);
			await tick();
			await Promise.all(inits);
			manager.writeToHistory("pane", "-during", getSession);
			old.isBackpressured = false;
			closeGate.release();
		`),
	).toEqual({ history: "after-during", inits: 2 });
});

test("a pane recreated while a clear waits for its close keeps the new history", () => {
	expect(
		runScenario(`
			closeGate = gate();
			manager.writeToHistory("pane", "\\x1b[3Jstale", getSession);
			manager.closeHistoryWriter("pane");
			initGate = gate();
			manager.initHistoryWriter({ paneId: "pane", ...session, initialScrollback: "fresh" });
			manager.writeToHistory("pane", "-next", getSession);
			closeGate.release();
			await Promise.all(closes);
			await tick();
			initGate.release();
		`),
	).toEqual({ history: "fresh-next", inits: 2 });
});

test("a history reset while a clear waits for its close keeps the reset history", () => {
	expect(
		runScenario(`
			closeGate = gate();
			manager.writeToHistory("pane", "\\x1b[3Jstale", getSession);
			initGate = gate();
			const reset = manager.resetAll(new Map([["pane", { ...session, isAlive: true }]]));
			await tick();
			manager.writeToHistory("pane", "next", getSession);
			closeGate.release();
			await Promise.all(closes);
			await tick();
			initGate.release();
			await reset;
		`),
	).toEqual({ history: "next", inits: 2 });
});
